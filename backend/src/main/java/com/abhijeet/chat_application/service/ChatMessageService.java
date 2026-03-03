package com.abhijeet.chat_application.service;

import com.abhijeet.chat_application.entity.ChatMessage;
import com.abhijeet.chat_application.entity.User;
import com.abhijeet.chat_application.repository.ChatMessageRepository;
import com.abhijeet.chat_application.entity.ChatRoom;
import com.abhijeet.chat_application.repository.ChatRoomRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.CacheManager;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ChatMessageService {

    private final ChatMessageRepository chatMessageRepository;
    private final ChatRoomRepository chatRoomRepository;
    private final CacheManager cacheManager;

    @Transactional
    public ChatMessage save(ChatMessage chatMessage) {
        if (chatMessage.getChatRoom() != null && chatMessage.getType() == ChatMessage.MessageType.CHAT) {
            ChatRoom room = chatMessage.getChatRoom();
            room.setLastMessage(chatMessage.getContent());
            room.setLastMessageTimestamp(chatMessage.getTimestamp());
            chatRoomRepository.save(room);

            // Invalidate user_chat_rooms cache for all participants
            var cache = cacheManager.getCache("user_chat_rooms");
            if (cache != null) {
                for (User participant : room.getParticipants()) {
                    cache.evict(participant.getUsername());
                }
            }
        }
        return chatMessageRepository.save(chatMessage);
    }

    public List<ChatMessage> getMessages(Long chatRoomId) {
        List<ChatMessage> messages;
        if (chatRoomId != null) {
            messages = chatMessageRepository.findTop50ByChatRoomIdOrderByTimestampDesc(chatRoomId);
        } else {
            messages = chatMessageRepository.findTop50ByChatRoomIsNullOrderByTimestampDesc();
        }
        List<ChatMessage> modifiableMessages = new ArrayList<>(messages);
        Collections.reverse(modifiableMessages);
        return modifiableMessages;
    }

    @Transactional
    public List<Long> markAsRead(Long chatRoomId, String readerUsername) {
        List<Long> messageIds = chatMessageRepository.findMessageIdsByChatRoomIdAndSenderUsernameNotAndStatusIn(
                chatRoomId, readerUsername,
                Arrays.asList(ChatMessage.MessageStatus.SENT, ChatMessage.MessageStatus.DELIVERED));

        if (messageIds.isEmpty())
            return Collections.emptyList();

        chatMessageRepository.updateMessageStatusBulk(messageIds, ChatMessage.MessageStatus.READ);
        return messageIds;
    }

    @Transactional
    public java.util.Map<Long, java.util.List<Long>> markAsDeliveredForUser(String username) {
        List<Object[]> unreadInfos = chatMessageRepository.findMessageInfoByParticipantAndSenderNotAndStatus(
                username, ChatMessage.MessageStatus.SENT);

        if (unreadInfos.isEmpty())
            return Collections.emptyMap();

        List<Long> allMessageIds = new ArrayList<>();
        java.util.Map<Long, java.util.List<Long>> roomIdToMessageIds = new java.util.HashMap<>();

        for (Object[] info : unreadInfos) {
            Long messageId = (Long) info[0];
            Long roomId = (Long) info[1];
            allMessageIds.add(messageId);

            roomIdToMessageIds.computeIfAbsent(roomId, k -> new ArrayList<>()).add(messageId);
        }

        chatMessageRepository.updateMessageStatusBulk(allMessageIds, ChatMessage.MessageStatus.DELIVERED);
        return roomIdToMessageIds;
    }

    public java.util.Map<String, Long> getUnreadCounts(String username) {
        List<Object[]> results = chatMessageRepository.countUnreadMessagesBySender(username);
        java.util.Map<String, Long> counts = new java.util.HashMap<>();
        for (Object[] result : results) {
            counts.put((String) result[0], ((Number) result[1]).longValue());
        }
        return counts;
    }

    @Cacheable(value = "user_chat_rooms", key = "#username")
    public java.util.Map<String, String> getLastMessages(String username) {
        List<ChatRoom> activeRooms = chatRoomRepository.findByParticipantsUsername(username);
        java.util.Map<String, String> lastMessages = new java.util.HashMap<>();

        for (ChatRoom room : activeRooms) {
            if (room.getLastMessage() != null) {
                for (User participant : room.getParticipants()) {
                    if (!participant.getUsername().equals(username)) {
                        lastMessages.put(participant.getUsername(), room.getLastMessage());
                        break;
                    }
                }
            }
        }
        return lastMessages;
    }
}
