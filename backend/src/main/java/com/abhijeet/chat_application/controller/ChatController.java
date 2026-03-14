package com.abhijeet.chat_application.controller;

import com.abhijeet.chat_application.entity.ChatMessage;
import com.abhijeet.chat_application.entity.ChatRoom;
import com.abhijeet.chat_application.entity.User;
import com.abhijeet.chat_application.exception.ResourceNotFoundException;
import com.abhijeet.chat_application.repository.ChatRoomRepository;
import com.abhijeet.chat_application.service.ChatMessageService;
import com.abhijeet.chat_application.service.FriendshipService;
import com.abhijeet.chat_application.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageSendingOperations;
import org.springframework.stereotype.Controller;

import java.time.LocalDateTime;

import org.springframework.transaction.annotation.Transactional;

@Controller
@RequiredArgsConstructor
@Slf4j
public class ChatController {

    private final ChatMessageService chatMessageService;
    private final SimpMessageSendingOperations messagingTemplate;
    private final UserService userService;
    private final ChatRoomRepository chatRoomRepository;
    private final FriendshipService friendshipService;

    @Transactional
    @MessageMapping("/chat.sendMessage")
    public void sendMessage(@Payload ChatMessageRequest request) {
        User sender;
        try {
            sender = userService.getUserByUsername(request.getSenderUsername());
        } catch (ResourceNotFoundException e) {
            log.error("Sender not found '{}': {}", request.getSenderUsername(), e.getMessage());
            return;
        }
        ChatRoom chatRoom = null;
        if (request.getChatRoomId() != null) {
            chatRoom = chatRoomRepository.findById(request.getChatRoomId()).orElse(null);
        }

        // Enforce friendship check for 1-on-1 chats
        if (chatRoom != null && !chatRoom.isGroupChat()) {
            for (User participant : chatRoom.getParticipants()) {
                if (!participant.getUsername().equals(sender.getUsername())) {
                    if (!friendshipService.areFriends(sender.getUsername(), participant.getUsername())) {
                        log.warn("Message blocked: {} is not friends with {}", sender.getUsername(),
                                participant.getUsername());
                        return;
                    }
                }
            }
        }

        ChatMessage.MessageStatus initialStatus = ChatMessage.MessageStatus.SENT;
        if (chatRoom != null && chatRoom.isGroupChat() == false) {
            for (User participant : chatRoom.getParticipants()) {
                if (!participant.getUsername().equals(sender.getUsername()) && participant.isOnline()) {
                    initialStatus = ChatMessage.MessageStatus.DELIVERED;
                    break;
                }
            }
        }

        ChatMessage chatMessage = ChatMessage.builder()
                .sender(sender)
                .chatRoom(chatRoom)
                .content(request.getContent())
                .type(request.getType())
                .timestamp(LocalDateTime.now())
                .status(initialStatus)
                .build();

        // Save the chat message in the DB
        chatMessage = chatMessageService.save(chatMessage);

        if (chatRoom != null) {
            // Provide to a specific chat room topic
            messagingTemplate.convertAndSend("/topic/chatrooms/" + chatRoom.getId(), chatMessage);
            // Notify each participant for their sidebar updates (last message, unread
            // counts)
            for (User participant : chatRoom.getParticipants()) {
                messagingTemplate.convertAndSend("/topic/user." + participant.getUsername(), chatMessage);
            }
        } else {
            // General public topic
            messagingTemplate.convertAndSend("/topic/public", chatMessage);
        }
    }

    @MessageMapping("/chat.addUser")
    @SendTo("/topic/public")
    public ChatMessage addUser(@Payload ChatMessageRequest request, SimpMessageHeaderAccessor headerAccessor) {
        User user;
        try {
            user = userService.getUserByUsername(request.getSenderUsername());
        } catch (ResourceNotFoundException e) {
            log.error("User not found '{}': {}", request.getSenderUsername(), e.getMessage());
            return null;
        }
        userService.connect(user);

        // Add username in web socket session
        headerAccessor.getSessionAttributes().put("username", user.getUsername());

        // Mark messages as delivered for this user
        java.util.Map<Long, java.util.List<Long>> roomIdToMessageIds = chatMessageService
                .markAsDeliveredForUser(user.getUsername());

        for (java.util.Map.Entry<Long, java.util.List<Long>> entry : roomIdToMessageIds.entrySet()) {
            StatusUpdateMessage statusUpdate = StatusUpdateMessage.builder()
                    .type(ChatMessage.MessageType.STATUS_UPDATE)
                    .chatRoomId(entry.getKey())
                    .messageIds(entry.getValue())
                    .newStatus(ChatMessage.MessageStatus.DELIVERED)
                    .build();
            messagingTemplate.convertAndSend("/topic/chatrooms/" + entry.getKey(), statusUpdate);
        }

        ChatMessage chatMessage = ChatMessage.builder()
                .sender(user)
                .type(ChatMessage.MessageType.JOIN)
                .timestamp(LocalDateTime.now())
                .build();

        // Save the JOIN message in the DB
        chatMessage = chatMessageService.save(chatMessage);

        return chatMessage;
    }

    @MessageMapping("/chat.readMessages")
    public void readMessages(@Payload ChatMessageRequest request) {
        Long chatRoomId = request.getChatRoomId();
        String readerUsername = request.getSenderUsername();

        if (chatRoomId != null) {
            java.util.List<Long> messageIds = chatMessageService.markAsRead(chatRoomId, readerUsername);

            if (!messageIds.isEmpty()) {
                StatusUpdateMessage statusUpdate = StatusUpdateMessage.builder()
                        .type(ChatMessage.MessageType.STATUS_UPDATE)
                        .chatRoomId(chatRoomId)
                        .messageIds(messageIds)
                        .newStatus(ChatMessage.MessageStatus.READ)
                        .build();

                messagingTemplate.convertAndSend("/topic/chatrooms/" + chatRoomId, statusUpdate);
            }
        }
    }
}
