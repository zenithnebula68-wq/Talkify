import React, { useState, useEffect, useRef } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { Send, User as UserIcon, LogOut, Check, CheckCheck, Users, UserPlus, Bell, ArrowLeft } from 'lucide-react';
import './index.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("chat-db", 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("keys")) {
        db.createObjectStore("keys");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const storeKey = async (keyName, keyData) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["keys"], "readwrite");
    const store = transaction.objectStore("keys");
    const request = store.put(keyData, keyName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const getKey = async (keyName) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["keys"], "readonly");
    const store = transaction.objectStore("keys");
    const request = store.get(keyName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const generateAndSaveKeyPair = async () => {
  try {
    const keyPair = await window.crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-384" },
      false, // NOT extractable
      ["deriveKey", "deriveBits"]
    );
    const publicKeyJwk = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);

    // Store raw CryptoKey objects in IndexedDB
    await storeKey("privateKey", keyPair.privateKey);
    await storeKey("publicKey", keyPair.publicKey);

    // Keep only the public JWK string in localStorage for easy access by other auth handlers
    const pubKeys = JSON.stringify(publicKeyJwk);
    localStorage.setItem('chatPublicKey', pubKeys);
    localStorage.removeItem('chatPrivateKey'); // Cleanup legacy

    return pubKeys;
  } catch (e) {
    console.error("Crypto error during key gen", e);
    return null;
  }
};

const getSharedKey = async (theirUsername, theirPublicKeyStr, sharedKeysCache) => {
  if (sharedKeysCache.current[theirUsername]) {
    return sharedKeysCache.current[theirUsername];
  }

  try {
    let myPrivateKey = await getKey("privateKey");

    // Migration fallback for existing keys in localStorage
    if (!myPrivateKey && localStorage.getItem('chatPrivateKey')) {
      const myPrivStr = localStorage.getItem('chatPrivateKey');
      const myPrivJwk = JSON.parse(myPrivStr);
      myPrivateKey = await window.crypto.subtle.importKey(
        "jwk",
        myPrivJwk,
        { name: "ECDH", namedCurve: "P-384" },
        false, // store as non-extractable
        ["deriveKey", "deriveBits"]
      );
      await storeKey("privateKey", myPrivateKey);
      localStorage.removeItem('chatPrivateKey');
    }

    if (!myPrivateKey || !theirPublicKeyStr) return null;

    const theirPubJwk = JSON.parse(theirPublicKeyStr);

    const theirPublicKey = await window.crypto.subtle.importKey(
      "jwk",
      theirPubJwk,
      { name: "ECDH", namedCurve: "P-384" },
      true,
      []
    );

    const derivedKey = await window.crypto.subtle.deriveKey(
      { name: "ECDH", public: theirPublicKey },
      myPrivateKey,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );

    sharedKeysCache.current[theirUsername] = derivedKey;
    return derivedKey;
  } catch (e) {
    console.error("Failed to derive shared key", e);
    return null;
  }
};

const bufferToBase64 = (buffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const base64ToBuffer = (base64) => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

const encryptMessageContent = async (text, sharedKey) => {
  if (!sharedKey) return text;
  try {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(text);
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      sharedKey,
      encoded
    );
    return "E2E:" + bufferToBase64(iv) + ":" + bufferToBase64(ciphertext);
  } catch (e) {
    console.error("Encryption error", e);
    return text;
  }
};

const decryptMessageContent = async (text, sharedKey) => {
  if (!text || !text.startsWith("E2E:") || !sharedKey) return text;
  try {
    // support compact base64 format "E2E:ivBase64:cipherBase64"
    if (text.includes('{"iv"')) {
      // old format compatibility just in case we can read it before truncation
      const payload = JSON.parse(text.substring(4));
      const iv = new Uint8Array(payload.iv);
      const ciphertext = new Uint8Array(payload.data);
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        sharedKey,
        ciphertext
      );
      return new TextDecoder().decode(decryptedBuffer);
    }

    const parts = text.split(":");
    if (parts.length !== 3) throw new Error("Invalid format");

    const iv = base64ToBuffer(parts[1]);
    const ciphertext = base64ToBuffer(parts[2]);
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(iv) },
      sharedKey,
      ciphertext
    );
    return new TextDecoder().decode(decryptedBuffer);
  } catch (e) {
    console.error("Decryption error", e);
    return "🔒 [Encrypted Message - Verification Failed]";
  }
};

const ChatApp = () => {
  const [username, setUsername] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [users, setUsers] = useState([]);
  const [friends, setFriends] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [activeTab, setActiveTab] = useState('friends');
  const [unreadCounts, setUnreadCounts] = useState({});
  const [lastMessages, setLastMessages] = useState({});
  const [password, setPassword] = useState('');
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('chatToken') || '');
  const [error, setError] = useState('');

  const [activeChat, setActiveChat] = useState(null); // No default public room

  const stompClientRef = useRef(null);
  const messagesEndRef = useRef(null);
  const currentSubscriptionRef = useRef(null);
  const openChatRequestIdRef = useRef(0);
  const sharedKeysCache = useRef({});
  const usersRef = useRef([]);
  const activeChatRef = useRef(null);

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const getAuthHeaders = () => ({
    'Authorization': `Bearer ${localStorage.getItem('chatToken')}`
  });

  const fetchUsersAndUpdateRef = async () => {
    try {
      const resUsers = await fetch(`${API_BASE_URL}/api/users`, { headers: getAuthHeaders() });
      if (resUsers.status === 401 || resUsers.status === 403) {
        handleDisconnect();
        throw new Error("Unauthorized");
      }
      if (!resUsers.ok) return [];
      const currentUser = username || localStorage.getItem('chatUsername');
      const newUsers = (await resUsers.json()).filter(u => u.username !== currentUser);
      setUsers(newUsers);
      usersRef.current = newUsers;
      return newUsers;
    } catch (err) {
      console.error("Error fetching users:", err);
      return [];
    }
  };

  const getUserPublicKey = async (targetUsername) => {
    // 1. Try from memory
    let user = usersRef.current.find(u => u.username === targetUsername);
    if (user && user.publicKey) return user.publicKey;

    // 2. Refresh users list if missing
    const refreshedUsers = await fetchUsersAndUpdateRef();
    user = refreshedUsers.find(u => u.username === targetUsername);
    return user ? user.publicKey : null;
  };

  const fetchFriendsData = async () => {
    const currentUser = username || localStorage.getItem('chatUsername');
    if (!currentUser) return;
    try {
      const headers = getAuthHeaders();
      const [fRes, pRes, sRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/friends?username=${encodeURIComponent(currentUser)}`, { headers }),
        fetch(`${API_BASE_URL}/api/friends/pending?username=${encodeURIComponent(currentUser)}`, { headers }),
        fetch(`${API_BASE_URL}/api/friends/sent?username=${encodeURIComponent(currentUser)}`, { headers }),
      ]);
      if (fRes.ok) setFriends(await fRes.json());
      if (pRes.ok) setPendingRequests(await pRes.json());
      if (sRes.ok) setSentRequests(await sRes.json());
    } catch (e) {
      console.error("Error fetching friends data", e);
    }
  };

  const loadUsers = async () => {
    try {
      const newUsers = await fetchUsersAndUpdateRef();
      if (!newUsers || newUsers.length === 0 && !isConnected) return; // Disconnected or failed
      await fetchFriendsData();

      const resCounts = await fetch(`${API_BASE_URL}/api/messages/unread-counts?username=${encodeURIComponent(username || localStorage.getItem('chatUsername'))}`, { headers: getAuthHeaders() });
      if (resCounts.status === 401 || resCounts.status === 403) return handleDisconnect();

      let parsedCounts = {};
      if (resCounts.ok) {
        parsedCounts = await resCounts.json();
      }
      setUnreadCounts(parsedCounts);

      const resLastMsgs = await fetch(`${API_BASE_URL}/api/messages/last-messages?username=${encodeURIComponent(username || localStorage.getItem('chatUsername'))}`, { headers: getAuthHeaders() });
      if (resLastMsgs.status === 401 || resLastMsgs.status === 403) return handleDisconnect();

      let dataLastMsgs = {};
      if (resLastMsgs.ok) {
        dataLastMsgs = await resLastMsgs.json();
      }

      const decryptedLastMessages = {};
      for (const [otherUser, content] of Object.entries(dataLastMsgs)) {
        if (content && content.startsWith("E2E:")) {
          const pubKey = newUsers.find(u => u.username === otherUser)?.publicKey;
          if (pubKey) {
            const sharedKey = await getSharedKey(otherUser, pubKey, sharedKeysCache);
            if (sharedKey) {
              decryptedLastMessages[otherUser] = await decryptMessageContent(content, sharedKey);
              continue;
            } else {
              console.warn(`Could not derive shared key for last message from ${otherUser}`);
            }
          } else {
            console.warn(`Could not find public key for ${otherUser}`);
          }
          decryptedLastMessages[otherUser] = "🔒 [Encrypted Message]";
        } else {
          decryptedLastMessages[otherUser] = content;
        }
      }
      setLastMessages(decryptedLastMessages);
    } catch (err) {
      console.error("Error in loadUsers:", err);
    }
  };

  // Load initial data on connect
  useEffect(() => {
    if (isConnected) {
      loadUsers();
    }
  }, [isConnected, username]);

  const handleSendRequest = async (toUsername) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/friends/request?from=${encodeURIComponent(username)}&to=${encodeURIComponent(toUsername)}`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (res.ok) fetchFriendsData();
    } catch (e) { console.error(e); }
  };

  const handleAcceptRequest = async (friendshipId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/friends/accept?friendshipId=${friendshipId}&username=${encodeURIComponent(username)}`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (res.ok) fetchFriendsData();
    } catch (e) { console.error(e); }
  };

  const handleRejectRequest = async (friendshipId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/friends/reject?friendshipId=${friendshipId}&username=${encodeURIComponent(username)}`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (res.ok) fetchFriendsData();
    } catch (e) { console.error(e); }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    setError('');

    let publicKeyStr = localStorage.getItem('chatPublicKey');
    if (!publicKeyStr) {
      publicKeyStr = await generateAndSaveKeyPair();
    }

    const endpoint = isLoginMode ? `${API_BASE_URL}/api/auth/login` : `${API_BASE_URL}/api/auth/register`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, publicKey: publicKeyStr })
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Authentication failed';
        try {
          const errorObj = JSON.parse(errorText);
          if (errorObj.message) {
            errorMessage = errorObj.message;
          }
        } catch (e) {
          if (errorText) errorMessage = errorText;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setToken(data.token);
      localStorage.setItem('chatToken', data.token);
      localStorage.setItem('chatUsername', data.username);
      connectWebSocket(data.token, data.username);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('chatToken');
    const storedUsername = localStorage.getItem('chatUsername');
    if (storedToken && storedUsername && !isConnected) {
      setUsername(storedUsername);
      setToken(storedToken);
      connectWebSocket(storedToken, storedUsername);
    }
  }, []);

  const connectWebSocket = (jwtToken, currentUsername) => {
    if (stompClientRef.current) {
      stompClientRef.current.deactivate();
    }
    const socket = new SockJS(`${API_BASE_URL}/ws`);
    const client = new Client({
      webSocketFactory: () => socket,
      reconnectDelay: 5000,
      connectHeaders: {
        Authorization: `Bearer ${jwtToken}`
      },
      onConnect: () => {
        setIsConnected(true);

        client.publish({
          destination: '/app/chat.addUser',
          body: JSON.stringify({ senderUsername: currentUsername, type: 'JOIN' }),
        });

        // Subscribe to public topic for user JOIN/LEAVE status updates
        client.subscribe('/topic/public', (message) => {
          const parsedMessage = JSON.parse(message.body);
          if (parsedMessage.type === 'JOIN' || parsedMessage.type === 'LEAVE') {
            fetchUsersAndUpdateRef(); // refresh user online statuses
          }
        });

        // Subscribe to personal topic for incoming messages (to update sidebar)
        client.subscribe(`/topic/user.${currentUsername}`, async (message) => {
          const parsedMessage = JSON.parse(message.body);
          if (parsedMessage.type === 'CHAT') {
            const senderName = parsedMessage.senderUsername || parsedMessage.sender?.username;

            // If the message is from someone else and NOT the person we are actively chatting with
            if (senderName !== currentUsername && (!activeChatRef.current || activeChatRef.current.name !== senderName)) {
              setUnreadCounts(prev => ({
                ...prev,
                [senderName]: (prev[senderName] || 0) + 1
              }));
            }

            // Determine the "other user" we are chatting with
            let otherUsername = senderName;
            if (senderName === currentUsername) {
              if (activeChatRef.current?.name) {
                otherUsername = activeChatRef.current.name;
              } else if (parsedMessage.chatRoom?.participants) {
                const otherParticipant = parsedMessage.chatRoom.participants.find(p => p.username !== currentUsername);
                if (otherParticipant) otherUsername = otherParticipant.username;
              }
            }

            // Decrypt content for sidebar last message if needed
            let finalContent = parsedMessage.content;
            if (finalContent && finalContent.startsWith("E2E:")) {
              const targetPubKey = await getUserPublicKey(otherUsername);
              if (targetPubKey) {
                const sharedKey = await getSharedKey(otherUsername, targetPubKey, sharedKeysCache);
                if (sharedKey) {
                  finalContent = await decryptMessageContent(finalContent, sharedKey);
                }
              } else {
                finalContent = "🔒 [Encrypted Message]";
              }
            }

            setLastMessages(prev => ({
              ...prev,
              [otherUsername]: finalContent
            }));
          }
        });
      },
      onStompError: (frame) => {
        console.error('Broker reported error: ' + frame.headers['message']);
        console.error('Additional details: ' + frame.body);
      },
    });

    stompClientRef.current = client;
    client.activate();
  };

  const openChat = async (chat) => {
    const requestId = ++openChatRequestIdRef.current;

    // Unsubscribe from previous if exists
    if (currentSubscriptionRef.current) {
      currentSubscriptionRef.current.unsubscribe();
      currentSubscriptionRef.current = null;
    }

    setActiveChat(chat);
    setMessages([]); // clear current view
    setUnreadCounts(prev => ({ ...prev, [chat.name]: 0 })); // reset unread count when opening chat

    let topic = '';
    let fetchUrl = '';

    if (chat.type === 'private') {
      try {
        const res = await fetch(`${API_BASE_URL}/api/chatrooms/1on1?user1=${encodeURIComponent(username)}&user2=${encodeURIComponent(chat.name)}`, { headers: getAuthHeaders() });
        const room = await res.json();
        chat.id = room.id; // set the true DB chatRoomId
        setActiveChat({ ...chat, id: room.id });

        topic = `/topic/chatrooms/${room.id}`;
        fetchUrl = `${API_BASE_URL}/api/messages?chatRoomId=${room.id}`;
      } catch (err) {
        console.error("Failed to establish 1 on 1 room", err);
        return;
      }
    }

    fetch(fetchUrl, { headers: getAuthHeaders() })
      .then((res) => res.json())
      .then(async (data) => {
        // Find their public key
        const targetUser = usersRef.current.find(u => u.username === chat.name);
        const pubKeyStr = targetUser ? targetUser.publicKey : null;

        let decryptedData = data;
        if (pubKeyStr) {
          const sharedKey = await getSharedKey(chat.name, pubKeyStr, sharedKeysCache);
          if (sharedKey) {
            decryptedData = await Promise.all(data.map(async m => {
              if (m.type === 'CHAT' && m.content && m.content.startsWith("E2E:")) {
                const content = await decryptMessageContent(m.content, sharedKey);
                return { ...m, content };
              }
              return m;
            }));
          } else {
            console.warn(`Could not derive shared key for history with ${chat.name}`);
          }
        }

        setMessages(decryptedData);
        // Mark existing messages as read when we open the chat
        if (chat.id && stompClientRef.current?.connected) {
          stompClientRef.current.publish({
            destination: '/app/chat.readMessages',
            body: JSON.stringify({ chatRoomId: chat.id, senderUsername: username })
          });
        }
      })
      .catch(err => console.error("Error fetching messages:", err));

    // Subscribe to the active room
    if (stompClientRef.current && stompClientRef.current.connected) {
      // Prevent stale subscriptions if the user rapidly clicked different chats
      if (openChatRequestIdRef.current !== requestId) return;

      currentSubscriptionRef.current = stompClientRef.current.subscribe(topic, async (message) => {
        const parsedMessage = JSON.parse(message.body);

        if (parsedMessage.type === 'STATUS_UPDATE') {
          setMessages((prev) => prev.map(m =>
            (parsedMessage.messageIds || []).includes(m.id) ? { ...m, status: parsedMessage.newStatus } : m
          ));
        } else {
          // Send read receipt if we receive a message that isn't ours while actively in this chat
          const senderName = parsedMessage.senderUsername || parsedMessage.sender?.username;

          if (parsedMessage.type === 'CHAT') {
            const theirUsername = senderName === username ? chat.name : senderName;

            const senderPubKey = await getUserPublicKey(theirUsername);

            if (senderPubKey) {
              const sharedKey = await getSharedKey(theirUsername, senderPubKey, sharedKeysCache);
              if (sharedKey && parsedMessage.content.startsWith("E2E:")) {
                parsedMessage.content = await decryptMessageContent(parsedMessage.content, sharedKey);
              } else if (!sharedKey) {
                console.warn(`Failed to derive shared key for incoming WebSocket message from ${theirUsername}`);
              }
            } else {
              console.warn(`Could not find target user or public key for incoming WebSocket message from ${theirUsername}`);
            }

            setMessages((prev) => [...prev, parsedMessage]);

            if (senderName !== username) {
              stompClientRef.current.publish({
                destination: '/app/chat.readMessages',
                body: JSON.stringify({ chatRoomId: parsedMessage.chatRoomId || chat.id, senderUsername: username })
              });
            }
          } else {
            setMessages((prev) => [...prev, parsedMessage]);
          }
        }
      });
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (messageInput.trim() && stompClientRef.current?.connected) {

      let finalContent = messageInput;
      const targetUser = usersRef.current.find(u => u.username === activeChat.name);
      if (targetUser && targetUser.publicKey) {
        const sharedKey = await getSharedKey(activeChat.name, targetUser.publicKey, sharedKeysCache);
        if (sharedKey) {
          finalContent = await encryptMessageContent(messageInput, sharedKey);
        }
      }

      const chatMessage = {
        senderUsername: username,
        content: finalContent,
        chatRoomId: activeChat.id, // null for public, number for private
        type: 'CHAT'
      };

      stompClientRef.current.publish({
        destination: '/app/chat.sendMessage',
        body: JSON.stringify(chatMessage)
      });
      setMessageInput('');
    }
  };

  const handleDisconnect = () => {
    if (stompClientRef.current) {
      stompClientRef.current.deactivate();
    }
    setIsConnected(false);
    setMessages([]);
    setUsername('');
    setPassword('');
    setToken('');
    localStorage.removeItem('chatToken');
    localStorage.removeItem('chatUsername');
    currentSubscriptionRef.current = null;
    sharedKeysCache.current = {};
  };

  const getInitials = (name) => {
    return name ? name.charAt(0).toUpperCase() : '?';
  };

  const getAvatarColor = (name) => {
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-red-500', 'bg-yellow-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500'];
    let hash = 0;
    if (name) {
      for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
      }
    }
    const index = Math.abs(hash % colors.length);
    return colors[index];
  };

  const formatLastSeen = (dateString) => {
    if (!dateString) return 'Offline';
    const date = new Date(dateString);
    const today = new Date();

    // Check if valid date
    if (isNaN(date.getTime())) return 'Offline';

    const isToday = date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.getDate() === yesterday.getDate() && date.getMonth() === yesterday.getMonth() && date.getFullYear() === yesterday.getFullYear();

    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `last seen today at ${time}`;
    if (isYesterday) return `last seen yesterday at ${time}`;
    return `last seen ${date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} at ${time}`;
  };

  const renderMessageStatus = (status, isMine) => {
    if (!isMine || !status) return null;

    switch (status) {
      case 'SENT':
        return <Check size={14} className="text-gray-400 ml-1 inline" />;
      case 'DELIVERED':
        return <CheckCheck size={14} className="text-gray-400 ml-1 inline" />;
      case 'READ':
        return <CheckCheck size={14} className="text-blue-500 ml-1 inline" />;
      default:
        return null;
    }
  };

  if (!isConnected) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-100">
        <div className="w-full max-w-md p-8 bg-white rounded-xl shadow-lg border border-gray-200">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-green-500 mb-2 font-sans tracking-tight">Talkify</h1>
            <p className="text-gray-500">{isLoginMode ? 'Login to your account' : 'Create an account'} to join the chat</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-500 p-3 rounded-lg text-sm text-center border border-red-200">
                {error}
              </div>
            )}
            <div>
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                required
              />
            </div>
            <div>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-green-500 text-white font-semibold py-3 px-4 rounded-lg mt-2 hover:bg-green-600 transition duration-200 ease-in-out transform hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
            >
              {isLoginMode ? 'Login' : 'Sign Up'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-500">
            {isLoginMode ? "Don't have an account? " : "Already have an account? "}
            <button
              onClick={() => { setIsLoginMode(!isLoginMode); setError(''); }}
              className="text-green-500 hover:text-green-600 font-semibold underline-offset-2 hover:underline focus:outline-none"
            >
              {isLoginMode ? 'Sign up' : 'Login'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-[#efeae2] font-sans">
      {/* Sidebar */}
      <div className={`w-full md:w-1/3 bg-white border-r border-gray-200 flex-col ${activeChat ? 'hidden md:flex' : 'flex'}`}>
        {/* Header */}
        <div className="bg-[#f0f2f5] p-3 flex justify-between items-center border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg ${getAvatarColor(username)}`}>
              {getInitials(username)}
            </div>
            <span className="font-semibold text-gray-800">{username}</span>
          </div>
          <button onClick={handleDisconnect} className="text-gray-600 hover:text-red-500 transition-colors">
            <LogOut size={20} />
          </button>
        </div>

        {/* Contacts/Chats List */}
        {/* Contacts/Chats List */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-3 bg-white text-sm font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 flex justify-between items-center">
            <span>Chats</span>
            <div className="flex space-x-2">
              <button
                onClick={() => setActiveTab('friends')}
                className={`p-1.5 rounded-md transition-colors ${activeTab === 'friends' ? 'bg-green-100 text-green-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                title="Friends"
              >
                <Users size={18} />
              </button>
              <button
                onClick={() => setActiveTab('add')}
                className={`p-1.5 rounded-md transition-colors ${activeTab === 'add' ? 'bg-green-100 text-green-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                title="Add Friend"
              >
                <UserPlus size={18} />
              </button>
              <button
                onClick={() => setActiveTab('requests')}
                className={`p-1.5 rounded-md relative transition-colors ${activeTab === 'requests' ? 'bg-green-100 text-green-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                title="Pending Requests"
              >
                <Bell size={18} />
                {pendingRequests.length > 0 && (
                  <span className="absolute top-1 right-1 block w-2 h-2 rounded-full bg-red-500 ring-2 ring-white"></span>
                )}
              </button>
            </div>
          </div>

          {activeTab === 'friends' && (
            friends.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="text-gray-400" size={24} />
                </div>
                <p className="text-sm text-gray-500">No friends yet.<br />Click the + icon to add some!</p>
              </div>
            ) : (
              friends.map(u => (
                <div
                  key={u.id}
                  onClick={() => openChat({ type: 'private', id: null, name: u.username })}
                  className={`p-3 border-b border-gray-100 flex items-center space-x-4 cursor-pointer hover:bg-[#f5f6f6] ${activeChat?.name === u.username ? 'bg-[#ebebeb]' : ''}`}
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${getAvatarColor(u.username)}`}>
                    {getInitials(u.username)}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex justify-between items-center mb-0.5">
                      <h3 className="text-[17px] font-normal text-gray-900 truncate pr-2">{u.username}</h3>
                      {unreadCounts[u.username] > 0 && (
                        <div className="w-[22px] h-[22px] bg-green-500 rounded-full flex justify-center items-center text-white text-[11.5px] font-bold flex-shrink-0">
                          {unreadCounts[u.username]}
                        </div>
                      )}
                    </div>
                    <p className={`text-sm whitespace-nowrap overflow-hidden text-ellipsis ${unreadCounts[u.username] > 0 ? 'text-green-600 font-medium' : 'text-gray-500'}`}>
                      {lastMessages[u.username] || 'Say hi...'}
                    </p>
                  </div>
                </div>
              ))
            )
          )}

          {activeTab === 'add' && (
            <div className="p-2">
              {users.filter(u => !friends.find(f => f.username === u.username)).length === 0 ? (
                <div className="p-4 text-center text-sm text-gray-500">No new users to add.</div>
              ) : (
                users.filter(u => !friends.find(f => f.username === u.username)).map(u => {
                  const hasSent = sentRequests.find(r => r.addressee.username === u.username);
                  const hasReceived = pendingRequests.find(r => r.requester.username === u.username);

                  return (
                    <div key={u.id} className="p-2 border-b border-gray-100 flex items-center justify-between hover:bg-[#f5f6f6] rounded-lg transition-colors">
                      <div className="flex items-center space-x-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${getAvatarColor(u.username)}`}>
                          {getInitials(u.username)}
                        </div>
                        <span className="font-medium text-gray-800">{u.username}</span>
                      </div>
                      {hasSent ? (
                        <span className="text-xs text-gray-500 font-medium px-3 py-1.5 bg-gray-100 rounded-md border border-gray-200">Pending</span>
                      ) : hasReceived ? (
                        <button onClick={() => setActiveTab('requests')} className="text-xs text-green-700 font-medium px-3 py-1.5 bg-green-100 hover:bg-green-200 rounded-md transition-colors">
                          Review
                        </button>
                      ) : (
                        <button onClick={() => handleSendRequest(u.username)} className="text-xs text-white font-medium px-3 py-1.5 bg-green-500 hover:bg-green-600 rounded-md shadow-sm transition-colors">
                          Add Friend
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'requests' && (
            <div className="p-2">
              {pendingRequests.length === 0 ? (
                <div className="p-4 text-center text-sm text-gray-500">No pending requests.</div>
              ) : (
                pendingRequests.map(r => (
                  <div key={r.id} className="p-3 border border-gray-200 bg-white rounded-xl shadow-sm mb-3 flex flex-col space-y-3">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${getAvatarColor(r.requester.username)}`}>
                        {getInitials(r.requester.username)}
                      </div>
                      <div className="flex-1">
                        <span className="font-semibold text-gray-800 text-sm">{r.requester.username}</span>
                        <p className="text-[13px] text-gray-500">sent you a friend request</p>
                      </div>
                    </div>
                    <div className="flex space-x-2 pt-1 border-t border-gray-100">
                      <button onClick={() => handleAcceptRequest(r.id)} className="flex-1 text-sm text-white font-medium py-1.5 bg-green-500 hover:bg-green-600 rounded-lg shadow-sm transition-colors">
                        Accept
                      </button>
                      <button onClick={() => handleRejectRequest(r.id)} className="flex-1 text-sm text-gray-700 font-medium py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                        Decline
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={`flex-1 flex flex-col w-full md:w-2/3 bg-[url('https://whatsapp-clone-web.netlify.app/bg-chat-tile-dark_a4be512e7195b6b733d9110b408f075d.png')] bg-repeat ${activeChat ? 'flex' : 'hidden md:flex'}`}>
        {!activeChat ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-[#f0f2f5] border-b-[6px] border-green-500">
            <h1 className="text-3xl font-light text-gray-700 mb-4 mt-8">Talkify</h1>
            <p className="text-sm text-gray-500 text-center max-w-md leading-relaxed">
              Select a user from the contact list to start a 1-on-1 private chat.<br />
              Messages are securely segregated between users.
            </p>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="bg-[#f0f2f5] p-3 flex items-center space-x-4 border-b border-gray-200 sticky top-0 z-10 w-full">
              <button
                onClick={() => setActiveChat(null)}
                className="md:hidden text-gray-600 hover:text-green-500 transition-colors"
                title="Back to Contacts"
              >
                <ArrowLeft size={24} />
              </button>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0 ${getAvatarColor(activeChat.name)}`}>
                {getInitials(activeChat.name)}
              </div>
              <div>
                <h2 className="font-normal text-[16px] text-gray-900">{activeChat.name}</h2>
                <p className="text-[13px] text-gray-500">
                  {users.find(u => u.username === activeChat.name)?.online ? 'Online' : formatLastSeen(users.find(u => u.username === activeChat.name)?.lastSeen)}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 relative scroll-smooth">
              {messages.map((message, index) => {
                const isEvent = message.type === 'JOIN' || message.type === 'LEAVE';
                const senderName = message.sender?.username || message.senderUsername;
                const isMine = senderName === username;

                if (isEvent) {
                  return (
                    <div key={index} className="flex justify-center my-2">
                      <div className="bg-white/90 shadow-sm text-gray-500 rounded-lg px-3 py-1 text-xs">
                        {senderName} {message.type === 'JOIN' ? 'joined' : 'left'}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={index} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`relative max-w-[75%] rounded-lg px-3 pt-2 pb-1 text-[14.2px] shadow-sm flex flex-col ${isMine ? 'bg-[#d9fdd3] rounded-tr-none' : 'bg-white rounded-tl-none'
                        }`}
                    >
                      <div className="flex flex-wrap items-end gap-2">
                        <span className="text-gray-900 leading-[19px] whitespace-pre-wrap word-break">{message.content}</span>

                        <div className="flex items-center space-x-1 float-right mt-1 ml-auto text-[11px] text-gray-500">
                          <span>
                            {message.timestamp
                              ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {renderMessageStatus(message.status, isMine)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="bg-[#f0f2f5] p-3 flex items-center space-x-2">
              <form onSubmit={handleSendMessage} className="flex-1 flex max-w-full items-center bg-white rounded-lg border border-gray-300 overflow-hidden">
                <input
                  type="text"
                  placeholder="Type a message"
                  className="flex-1 py-3 px-4 text-[15px] outline-none border-none bg-transparent"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                />
                <button
                  type="submit"
                  className="p-3 text-gray-500 hover:text-green-500 transition-colors"
                  disabled={!messageInput.trim()}
                >
                  <Send size={24} />
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ChatApp;