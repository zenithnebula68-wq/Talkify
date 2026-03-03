package com.abhijeet.chat_application.service;

import com.abhijeet.chat_application.entity.User;
import com.abhijeet.chat_application.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;

    public User getUserByUsername(String username) {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("User not found with username: " + username));
    }

    public void disconnect(User user) {
        user.setOnline(false);
        user.setLastSeen(LocalDateTime.now());
        userRepository.save(user);
    }

    public void connect(User user) {
        user.setOnline(true);
        userRepository.save(user);
    }
}
