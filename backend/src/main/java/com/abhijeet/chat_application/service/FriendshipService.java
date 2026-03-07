package com.abhijeet.chat_application.service;

import com.abhijeet.chat_application.entity.Friendship;
import com.abhijeet.chat_application.entity.User;
import com.abhijeet.chat_application.exception.BadRequestException;
import com.abhijeet.chat_application.exception.ResourceNotFoundException;
import com.abhijeet.chat_application.repository.FriendshipRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class FriendshipService {

    private final FriendshipRepository friendshipRepository;
    private final UserService userService;

    /**
     * Send a friend request from requester to addressee.
     */
    @Transactional
    public Friendship sendFriendRequest(String requesterUsername, String addresseeUsername) {
        if (requesterUsername.equals(addresseeUsername)) {
            throw new BadRequestException("Cannot send a friend request to yourself");
        }

        User requester = userService.getUserByUsername(requesterUsername);
        User addressee = userService.getUserByUsername(addresseeUsername);

        // Check if a friendship already exists between these two users
        Optional<Friendship> existing = friendshipRepository.findByUsers(requester, addressee);
        if (existing.isPresent()) {
            Friendship f = existing.get();
            if (f.getStatus() == Friendship.FriendshipStatus.ACCEPTED) {
                throw new BadRequestException("You are already friends with " + addresseeUsername);
            }
            if (f.getStatus() == Friendship.FriendshipStatus.PENDING) {
                // If the addressee already sent a request to us, auto-accept it
                if (f.getRequester().getUsername().equals(addresseeUsername)) {
                    f.setStatus(Friendship.FriendshipStatus.ACCEPTED);
                    f.setUpdatedAt(LocalDateTime.now());
                    return friendshipRepository.save(f);
                }
                throw new BadRequestException("Friend request already sent to " + addresseeUsername);
            }
            if (f.getStatus() == Friendship.FriendshipStatus.REJECTED) {
                // Allow re-sending after rejection
                f.setRequester(requester);
                f.setAddressee(addressee);
                f.setStatus(Friendship.FriendshipStatus.PENDING);
                f.setUpdatedAt(LocalDateTime.now());
                return friendshipRepository.save(f);
            }
        }

        Friendship friendship = Friendship.builder()
                .requester(requester)
                .addressee(addressee)
                .status(Friendship.FriendshipStatus.PENDING)
                .build();

        return friendshipRepository.save(friendship);
    }

    /**
     * Accept a pending friend request.
     */
    @Transactional
    public Friendship acceptFriendRequest(Long friendshipId, String acceptingUsername) {
        Friendship friendship = friendshipRepository.findById(friendshipId)
                .orElseThrow(() -> new ResourceNotFoundException("Friendship", "id", friendshipId.toString()));

        if (!friendship.getAddressee().getUsername().equals(acceptingUsername)) {
            throw new BadRequestException("You can only accept friend requests sent to you");
        }

        if (friendship.getStatus() != Friendship.FriendshipStatus.PENDING) {
            throw new BadRequestException("This friend request is not pending");
        }

        friendship.setStatus(Friendship.FriendshipStatus.ACCEPTED);
        friendship.setUpdatedAt(LocalDateTime.now());
        return friendshipRepository.save(friendship);
    }

    /**
     * Reject a pending friend request.
     */
    @Transactional
    public Friendship rejectFriendRequest(Long friendshipId, String rejectingUsername) {
        Friendship friendship = friendshipRepository.findById(friendshipId)
                .orElseThrow(() -> new ResourceNotFoundException("Friendship", "id", friendshipId.toString()));

        if (!friendship.getAddressee().getUsername().equals(rejectingUsername)) {
            throw new BadRequestException("You can only reject friend requests sent to you");
        }

        if (friendship.getStatus() != Friendship.FriendshipStatus.PENDING) {
            throw new BadRequestException("This friend request is not pending");
        }

        friendship.setStatus(Friendship.FriendshipStatus.REJECTED);
        friendship.setUpdatedAt(LocalDateTime.now());
        return friendshipRepository.save(friendship);
    }

    /**
     * Get the list of friends (accepted) for a user.
     */
    public List<User> getFriends(String username) {
        User user = userService.getUserByUsername(username);
        List<Friendship> friendships = friendshipRepository.findAcceptedFriendships(user);
        List<User> friends = new ArrayList<>();
        for (Friendship f : friendships) {
            if (f.getRequester().getUsername().equals(username)) {
                friends.add(f.getAddressee());
            } else {
                friends.add(f.getRequester());
            }
        }
        return friends;
    }

    /**
     * Get pending friend requests received by a user.
     */
    public List<Friendship> getPendingRequests(String username) {
        User user = userService.getUserByUsername(username);
        return friendshipRepository.findPendingRequestsForUser(user);
    }

    /**
     * Get pending friend requests sent by a user.
     */
    public List<Friendship> getSentRequests(String username) {
        User user = userService.getUserByUsername(username);
        return friendshipRepository.findPendingRequestsSentByUser(user);
    }

    /**
     * Check if two users are friends.
     */
    public boolean areFriends(String username1, String username2) {
        User user1 = userService.getUserByUsername(username1);
        User user2 = userService.getUserByUsername(username2);
        return friendshipRepository.areFriends(user1, user2);
    }

    /**
     * Get friendship status between two users. Returns null if no friendship
     * exists.
     */
    public Friendship getFriendshipBetween(String username1, String username2) {
        User user1 = userService.getUserByUsername(username1);
        User user2 = userService.getUserByUsername(username2);
        return friendshipRepository.findByUsers(user1, user2).orElse(null);
    }
}
