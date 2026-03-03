# Talkify - Secure Real-Time Chat

Talkify is a modern, real-time chat application featuring **End-to-End Encryption (E2EE)** built with React and Spring Boot. It uses WebSockets for instant message delivery and the Web Crypto API to ensure no one but the intended recipient can read your messages. The backend is performance-engineered with **database optimizations** and **Redis caching** for production-grade scalability.

---

## 🚀 Features

- **End-to-End Encryption (E2EE)**
  - Client-side cryptographic key generation using the Web Crypto API.
  - Non-extractable ECDH (Curve P-384) private keys safely persisted in the browser's IndexedDB.
  - Secure message payloads encrypted with AES-GCM (256-bit) using derived shared secrets.
  - The backend server only ever handles ciphertext; it cannot read your messages.
- **Real-Time Communication**
  - Low-latency bi-directional messaging powered by WebSockets and the STOMP protocol.
- **JWT Authentication**
  - Secure user registration and login endpoints protected by Spring Security.
- **Private 1-on-1 Chat Rooms**
  - Isolated chat histories tied securely between two users.
- **Read Receipts & Statuses**
  - Live message statuses (Sent, Delivered, Read) complete with UI checkmarks.
- **Database Performance Optimizations**
  - Composite indexing, cursor pagination, denormalization, and batch SQL operations.
- **Redis Caching**
  - Sidebar data cached in Redis with automatic invalidation on new messages.
- **Modern UI / UX**
  - Responsive, WhatsApp-like design built seamlessly with React, Tailwind CSS, and Lucide Icons.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Frontend (React + Vite)                     │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────────┐ │
│  │  React UI │  │ STOMP.js     │  │ E2EE Engine               │ │
│  │  (App.jsx)│  │ (WebSocket)  │  │ (ECDH + AES-GCM)          │ │
│  └─────┬─────┘  └──────┬───────┘  └─────────────┬─────────────┘ │
│        │HTTP REST       │STOMP/WS               │IndexedDB      │
└────────┼────────────────┼───────────────────────┼───────────────┘
         │                │                       │
┌────────┼────────────────┼───────────────────────┼───────────────┐
│        ▼                ▼        Spring Boot 4.0 Backend        │
│  ┌───────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │  REST API  │  │ WebSocket    │  │  Security Layer          │ │
│  │ Controllers│  │ Controller   │  │  (JWT + Spring Security) │ │
│  └─────┬──────┘  └──────┬───────┘  └──────────────────────────┘ │
│        │                │                                        │
│  ┌─────▼────────────────▼──────────────────────────────────────┐ │
│  │              Service Layer                                   │ │
│  │  UserService  ·  ChatMessageService (@Cacheable, @Transact) │ │
│  └──────────┬──────────────────────────┬───────────────────────┘ │
│             │                          │                         │
└─────────────┼──────────────────────────┼─────────────────────────┘
              │                          │
    ┌─────────▼─────────┐     ┌──────────▼──────────┐
    │   PostgreSQL       │     │    Redis Cache       │
    │ (Primary Storage)  │     │  (Sidebar Data)      │
    │                    │     │                      │
    │ • users            │     │ • user_chat_rooms::  │
    │ • chat_rooms       │     │   {username}         │
    │ • chat_messages    │     │   TTL: 1 hour        │
    │ • chat_room_       │     │                      │
    │   participants     │     │                      │
    └────────────────────┘     └──────────────────────┘
```

---

## 🛠️ Technology Stack

### Frontend
- **Framework**: React 19 with Vite
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **WebSockets**: `@stomp/stompjs` & `sockjs-client`
- **Security**: Web Crypto API + IndexedDB

### Backend
- **Framework**: Java 17 + Spring Boot 4.0
- **Database**: PostgreSQL
- **Cache**: Redis (via `spring-boot-starter-data-redis`)
- **ORM**: Spring Data JPA / Hibernate
- **Security**: Spring Security + JWT (`io.jsonwebtoken`)
- **Messaging**: Spring WebSocket (STOMP)

---

## ⚡ Performance Optimizations

The backend implements 6 key strategies to minimize database load and ensure sub-millisecond response times:

| # | Strategy | Technique | Impact |
|---|---|---|---|
| 1 | **Caching** | Redis `@Cacheable` on sidebar `getLastMessages()` | Sidebar loads from memory, 0 DB hits on repeat |
| 2 | **Pagination** | `findTop50...OrderByTimestampDesc` | Never loads more than 50 messages per chat |
| 3 | **Indexing** | Composite indexes on `(chat_room_id, timestamp)` and `(sender_id, status)` | O(log N) lookups instead of O(N) full table scans |
| 4 | **Denormalization** | `last_message` field directly on `chat_rooms` table | Sidebar never touches `chat_messages` table |
| 5 | **Batch Updates** | `UPDATE ... WHERE id IN (...)` via `@Modifying` query | 50 read receipts = 1 query instead of 50 |
| 6 | **@Transactional** | Single DB session per message send | Eliminates redundant merge/re-fetch queries |

### Before vs After
```
BEFORE: Opening a chat with 50 unread messages
  → 1 SELECT (all messages) + 50 SELECT + 50 UPDATE = 101 queries

AFTER: Opening a chat with 50 unread messages
  → 1 SELECT (top 50 paginated) + 1 SELECT (IDs only) + 1 UPDATE (bulk) = 3 queries
```

---

## ⚙️ Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Java 17+](https://adoptium.net/)
- [PostgreSQL](https://www.postgresql.org/)
- [Docker](https://www.docker.com/) (for Redis)

### 1. Start Redis
```bash
docker run -d --name chat-redis -p 6379:6379 redis
```

### 2. Backend Setup
1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Update the `src/main/resources/application.properties` file with your PostgreSQL credentials.
3. Run the Spring Boot application using Maven:
   ```bash
   ./mvnw spring-boot:run
   ```
   *The backend will typically start on `http://localhost:8080`.*

### 3. Frontend Setup
1. Navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install the JavaScript dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   *The frontend will typically start on `http://localhost:5173`.*

---

## 🔐 How the E2EE Works

When a user signs up or logs in:
1. The client browser generates a public/private key pair (ECDH P-384).
2. The **private key** is marked as `extractable: false` and saved permanently in the browser's IndexedDB. (Even XSS attacks cannot extract the raw private key material).
3. The **public key** is sent to the Spring Boot backend to be associated with the user account.

When User A messages User B:
1. User A fetches User B's public key from the backend API.
2. User A uses their own private key and User B's public key to derive a secure shared secret locally via ECDH.
3. User A encrypts the plaintext message using AES-GCM with the derived shared secret.
4. User A sends the resulting ciphertext to the server over WebSockets.
5. User B receives the ciphertext, derives the exact same shared secret using their private key + User A's public key, and decrypts the message securely on their screen.

```
User A                         Server                        User B
  │                              │                              │
  │  Generate ECDH keypair       │       Generate ECDH keypair  │
  │  Store private in IndexedDB  │    Store private in IndexedDB│
  │                              │                              │
  │──── Send public key ────────►│◄──── Send public key ────────│
  │                              │                              │
  │  Derive shared secret        │                              │
  │  (myPrivate + theirPublic)   │                              │
  │                              │                              │
  │  Encrypt: AES-GCM(message)   │                              │
  │──── "E2E:iv:ciphertext" ────►│──── "E2E:iv:ciphertext" ────►│
  │                              │                              │
  │        Server CANNOT         │       Derive shared secret   │
  │        decrypt this!         │    (myPrivate + theirPublic) │
  │                              │                              │
  │                              │       Decrypt: AES-GCM(ct)   │
  │                              │       "Hello!" ✅             │
```

---

## 💡 What I Learned

Building this project provided deep hands-on experience in several complex domains:
- **Web Cryptography API**: Leveraging browser-native APIs for secure key generation (ECDH), strict extraction rules, and symmetric encryption (AES-GCM), preventing exposure of private keys even if the JavaScript context is compromised.
- **IndexedDB**: Moving away from insecure `localStorage` to securely store `CryptoKey` objects natively without unnecessary string parsing overhead or exposing keys to XSS payloads.
- **Database Performance Engineering**: Implementing composite indexing, cursor pagination, denormalization, batch SQL updates, and Redis caching to reduce database load by over 90%.
- **Redis Caching with Spring Boot**: Integrating `spring-boot-starter-data-redis` for cache-aside pattern, understanding JDK vs JSON serialization tradeoffs, and designing smart cache invalidation strategies.
- **WebSocket Concurrency & State Management**: Managing complex race conditions in React where WebSocket connections occur simultaneously with REST API metadata fetches, ensuring message decryption never fails due to missing state.
- **Full-Stack Integration**: Bridging a robust Java + Spring Boot backend via STOMP WebSockets and REST endpoints with a modern React + Vite frontend seamlessly.

---

## 🔮 Future Enhancements

- **Group Chats**: Extend E2EE architecture using the Signal Protocol (Sender Keys) or by individually encrypting payloads for each group member.
- **Push Notifications**: Integrate service workers and Web Push API to alert users of messages when the app is running in the background.
- **Media & Attachments**: Apply client-side encryption to files (images, PDFs) before uploading them to an S3-compatible cloud storage bucket.
- **Offline Mode**: Implement local PouchDB/IndexedDB synchronization so users can view parsed chat histories even without an active internet connection.
- **Kafka Event Streaming**: Offload heavy secondary tasks (analytics, audit logging) to async Kafka consumers for further performance gains.
