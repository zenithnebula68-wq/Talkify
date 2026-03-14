package com.abhijeet.chat_application.repository;

import com.abhijeet.chat_application.entity.Friendship;
import com.abhijeet.chat_application.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface FriendshipRepository extends JpaRepository<Friendship, Long> {

    // Find a specific friendship between two users (in either direction)
    @Query("SELECT f FROM Friendship f WHERE " +
            "(f.requester = :user1 AND f.addressee = :user2) OR " +
            "(f.requester = :user2 AND f.addressee = :user1)")
    Optional<Friendship> findByUsers(@Param("user1") User user1, @Param("user2") User user2);

    // Find all accepted friendships for a user
    @Query("SELECT f FROM Friendship f WHERE " +
            "(f.requester = :user OR f.addressee = :user) AND f.status = 'ACCEPTED'")
    List<Friendship> findAcceptedFriendships(@Param("user") User user);

    // Find all pending friend requests received by a user
    @Query("SELECT f FROM Friendship f WHERE f.addressee = :user AND f.status = 'PENDING'")
    List<Friendship> findPendingRequestsForUser(@Param("user") User user);

    // Find all pending friend requests sent by a user
    @Query("SELECT f FROM Friendship f WHERE f.requester = :user AND f.status = 'PENDING'")
    List<Friendship> findPendingRequestsSentByUser(@Param("user") User user);

    // Check if two users are friends (accepted)
    @Query("SELECT COUNT(f) > 0 FROM Friendship f WHERE " +
            "((f.requester = :user1 AND f.addressee = :user2) OR " +
            "(f.requester = :user2 AND f.addressee = :user1)) AND f.status = 'ACCEPTED'")
    boolean areFriends(@Param("user1") User user1, @Param("user2") User user2);
}
