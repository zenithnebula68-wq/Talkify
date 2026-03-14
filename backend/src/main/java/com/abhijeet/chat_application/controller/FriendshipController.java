package com.abhijeet.chat_application.controller;

import com.abhijeet.chat_application.entity.Friendship;
import com.abhijeet.chat_application.entity.User;
import com.abhijeet.chat_application.service.FriendshipService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/friends")
@RequiredArgsConstructor
public class FriendshipController {

    private final FriendshipService friendshipService;

    /**
     * Send a friend request.
     * POST /api/friends/request?from=alice&to=bob
     */
    @PostMapping("/request")
    public ResponseEntity<Friendship> sendFriendRequest(
            @RequestParam String from,
            @RequestParam String to) {
        return ResponseEntity.ok(friendshipService.sendFriendRequest(from, to));
    }

    /**
     * Accept a friend request.
     * POST /api/friends/accept?friendshipId=1&username=bob
     */
    @PostMapping("/accept")
    public ResponseEntity<Friendship> acceptFriendRequest(
            @RequestParam Long friendshipId,
            @RequestParam String username) {
        return ResponseEntity.ok(friendshipService.acceptFriendRequest(friendshipId, username));
    }

    /**
     * Reject a friend request.
     * POST /api/friends/reject?friendshipId=1&username=bob
     */
    @PostMapping("/reject")
    public ResponseEntity<Friendship> rejectFriendRequest(
            @RequestParam Long friendshipId,
            @RequestParam String username) {
        return ResponseEntity.ok(friendshipService.rejectFriendRequest(friendshipId, username));
    }

    /**
     * Get the list of friends for a user.
     * GET /api/friends?username=alice
     */
    @GetMapping
    public ResponseEntity<List<User>> getFriends(@RequestParam String username) {
        return ResponseEntity.ok(friendshipService.getFriends(username));
    }

    /**
     * Get pending friend requests received by a user.
     * GET /api/friends/pending?username=alice
     */
    @GetMapping("/pending")
    public ResponseEntity<List<Friendship>> getPendingRequests(@RequestParam String username) {
        return ResponseEntity.ok(friendshipService.getPendingRequests(username));
    }

    /**
     * Get pending friend requests sent by a user.
     * GET /api/friends/sent?username=alice
     */
    @GetMapping("/sent")
    public ResponseEntity<List<Friendship>> getSentRequests(@RequestParam String username) {
        return ResponseEntity.ok(friendshipService.getSentRequests(username));
    }

    /**
     * Check if two users are friends.
     * GET /api/friends/check?user1=alice&user2=bob
     */
    @GetMapping("/check")
    public ResponseEntity<Map<String, Boolean>> areFriends(
            @RequestParam String user1,
            @RequestParam String user2) {
        boolean friends = friendshipService.areFriends(user1, user2);
        return ResponseEntity.ok(Map.of("areFriends", friends));
    }

    /**
     * Get the friendship status between two users.
     * GET /api/friends/status?user1=alice&user2=bob
     */
    @GetMapping("/status")
    public ResponseEntity<Friendship> getFriendshipStatus(
            @RequestParam String user1,
            @RequestParam String user2) {
        Friendship friendship = friendshipService.getFriendshipBetween(user1, user2);
        return ResponseEntity.ok(friendship);
    }
}
