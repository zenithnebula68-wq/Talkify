# Talkify - Secure Real-Time Chat

Talkify is a modern, real-time chat application featuring **End-to-End Encryption (E2EE)** built with React and Spring Boot. It uses WebSockets for instant message delivery and the Web Crypto API to ensure no one but the intended recipient can read your messages.

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
- **Modern UI / UX**
  - Responsive, WhatsApp-like design built seamlessly with React, Tailwind CSS, and Lucide Icons.

---

## 🛠️ Technology Stack

### Frontend
- **Framework**: React 19 with Vite
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **WebSockets**: `@stomp/stompjs` & `sockjs-client`
- **Security**: Web Crypto API + IndexedDB

### Backend
- **Framework**: Java 17 + Spring Boot
- **Database**: PostgreSQL
- **ORM**: Spring Data JPA / Hibernate
- **Security**: Spring Security + JWT (`io.jsonwebtoken`)
- **Messaging**: Spring WebSocket (STOMP)

---

## ⚙️ Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Java 17+](https://adoptium.net/)
- [PostgreSQL](https://www.postgresql.org/)

### 1. Backend Setup
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

### 2. Frontend Setup
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

---

## 💡 What I Learned

Building this project provided deep hands-on experience in several complex domains:
- **Web Cryptography API**: Leveraging browser-native APIs for secure key generation (ECDH), strict extraction rules, and symmetric encryption (AES-GCM), preventing exposure of private keys even if the JavaScript context is compromised.
- **IndexedDB**: Moving away from insecure `localStorage` to securely store `CryptoKey` objects natively without unnecessary string parsing overhead or exposing keys to XSS payloads.
- **WebSocket Concurrency & State Management**: Managing complex race conditions in React where WebSocket connections occur simultaneously with REST API metadata fetches, ensuring message decryption never fails due to missing state.
- **Full-Stack Integration**: Bridging a robust Java + Spring Boot backend via STOMP WebSockets and REST endpoints with a modern React + Vite frontend seamlessly.

---

## 🔮 Future Enhancements

- [ ] **Group Chats**: Extend E2EE architecture using the Signal Protocol (Sender Keys) or by individually encrypting payloads for each group member.
- [ ] **Push Notifications**: Integrate service workers and Web Push API to alert users of messages when the app is running in the background.
- [ ] **Media & Attachments**: Apply client-side encryption to files (images, PDFs) before uploading them to an S3-compatible cloud storage bucket.
- [ ] **Offline Mode**: Implement local PouchDB/IndexedDB synchronization so users can view parsed chat histories even without an active internet connection.

---

## � License
This project is open-source and available under the MIT License.
