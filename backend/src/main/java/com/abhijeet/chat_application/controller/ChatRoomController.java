package com.abhijeet.chat_application.controller;

import com.abhijeet.chat_application.entity.ChatRoom;
import com.abhijeet.chat_application.entity.User;
import com.abhijeet.chat_application.repository.ChatRoomRepository;
import com.abhijeet.chat_application.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/chatrooms")
@RequiredArgsConstructor
public class ChatRoomController {

    private final ChatRoomRepository chatRoomRepository;
    private final UserService userService;

    @GetMapping("/1on1")
    public ResponseEntity<ChatRoom> getOrCreate1on1Room(@RequestParam String user1, @RequestParam String user2) {
        if (user1.equals(user2)) {
            return ResponseEntity.badRequest().build();
        }

        User u1;
        User u2;
        try {
            u1 = userService.getUserByUsername(user1);
            u2 = userService.getUserByUsername(user2);
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }

        // Find existing 1on1 room
        List<ChatRoom> roomsWithU1 = chatRoomRepository.findByParticipantsContaining(u1);
        Optional<ChatRoom> existingRoom = roomsWithU1.stream()
                .filter(room -> !room.isGroupChat() && room.getParticipants().contains(u2))
                .findFirst();

        if (existingRoom.isPresent()) {
            return ResponseEntity.ok(existingRoom.get());
        }

        // Create new room if none exists
        ChatRoom newRoom = ChatRoom.builder()
                .isGroupChat(false)
                .participants(List.of(u1, u2))
                .build();
        return ResponseEntity.ok(chatRoomRepository.save(newRoom));
    }
}
