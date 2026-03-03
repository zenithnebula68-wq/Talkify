package com.abhijeet.chat_application.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
@Entity
@Table(name = "chat_rooms")
public class ChatRoom implements java.io.Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;

    @Builder.Default
    private boolean isGroupChat = false;

    @ManyToMany(fetch = FetchType.EAGER)
    @JoinTable(name = "chat_room_participants", joinColumns = @JoinColumn(name = "chat_room_id"), inverseJoinColumns = @JoinColumn(name = "user_id"))
    @Builder.Default
    private List<User> participants = new ArrayList<>();

    @Column(columnDefinition = "TEXT")
    private String lastMessage;

    private LocalDateTime lastMessageTimestamp;

    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
