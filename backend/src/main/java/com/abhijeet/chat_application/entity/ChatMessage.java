package com.abhijeet.chat_application.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
@Entity
@Table(name = "chat_messages", indexes = {
        @Index(name = "idx_chat_timestamp", columnList = "chat_room_id, timestamp"),
        @Index(name = "idx_sender_status", columnList = "sender_id, status")
})
public class ChatMessage implements java.io.Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "chat_room_id")
    private ChatRoom chatRoom;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "sender_id", nullable = false)
    private User sender;

    @Column(columnDefinition = "TEXT")
    private String content;

    @Enumerated(EnumType.STRING)
    private MessageType type;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private MessageStatus status = MessageStatus.SENT;

    @Builder.Default
    private LocalDateTime timestamp = LocalDateTime.now();

    public enum MessageType {
        CHAT, JOIN, LEAVE, STATUS_UPDATE
    }

    public enum MessageStatus {
        SENT,
        DELIVERED,
        READ
    }
}
