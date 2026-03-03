package com.abhijeet.chat_application.config;

import com.abhijeet.chat_application.entity.ChatMessage;
import com.abhijeet.chat_application.entity.User;
import com.abhijeet.chat_application.service.ChatMessageService;
import com.abhijeet.chat_application.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessageSendingOperations;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.time.LocalDateTime;

@Component
@Slf4j
@RequiredArgsConstructor
public class WebSocketEventListener {

    private final SimpMessageSendingOperations messagingTemplate;
    private final ChatMessageService chatMessageService;
    private final UserService userService;

    @EventListener
    public void handleWebSocketDisconnectListener(SessionDisconnectEvent event) {
        StompHeaderAccessor headerAccessor = StompHeaderAccessor.wrap(event.getMessage());
        String username = (String) headerAccessor.getSessionAttributes().get("username");

        if (username != null) {
            log.info("user disconnected: {}", username);
            try {
                User user = userService.getUserByUsername(username);
                userService.disconnect(user);

                var chatMessage = ChatMessage.builder()
                        .type(ChatMessage.MessageType.LEAVE)
                        .sender(user)
                        .timestamp(LocalDateTime.now())
                        .build();

                chatMessageService.save(chatMessage);
                messagingTemplate.convertAndSend("/topic/public", chatMessage);
            } catch (Exception e) {
                log.warn("Disconnected user not found in DB: {}", username);
            }
        }
    }
}
