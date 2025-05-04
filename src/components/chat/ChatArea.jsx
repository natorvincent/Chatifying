import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Typography, Avatar, Grid, TextField, Button, Menu, MenuItem, IconButton, Snackbar, CircularProgress, Fab, useTheme, Popover } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ReplyIcon from '@mui/icons-material/Reply';
import CircleIcon from '@mui/icons-material/Circle';
import DoNotDisturbOnIcon from '@mui/icons-material/DoNotDisturbOn';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import TranslateIcon from '@mui/icons-material/Translate';
import AddReactionIcon from '@mui/icons-material/AddReaction';
import ImageIcon from '@mui/icons-material/Image';
import axios from 'axios';
import { translateToLanguage } from '../../services/geminiTranslator';
import TranslationAnimation from './TranslationAnimation';
import UserInfoModal from './UserInfoModal';
import { keyframes } from '@mui/system';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import MessageReactions from './MessageReactions';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';

const ChatArea = ({ currentUser, chatUser, onClose, setUserStatuses }) => {
  const theme = useTheme();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedMessageId, setSelectedMessageId] = useState(null);
  const [showOriginalFor, setShowOriginalFor] = useState(null);
  const [contactLanguage, setContactLanguage] = useState(chatUser.language);
  const [showLanguageNotification, setShowLanguageNotification] = useState(false);
  const [chatUserStatus, setChatUserStatus] = useState('offline');
  const messagesEndRef = useRef(null);
  const previousChatUserRef = useRef(chatUser);
  const [isSending, setIsSending] = useState(false);
  const [isUserInfoModalOpen, setIsUserInfoModalOpen] = useState(false);
  const [currentVariation, setCurrentVariation] = useState({});
  const [regeneratingTranslation, setRegeneratingTranslation] = useState(null);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [shownTimestamps, setShownTimestamps] = useState(new Set());
  const [hoveredMessageId, setHoveredMessageId] = useState(null);
  const hoverTimeoutRef = useRef(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const chatContainerRef = useRef(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [isScrolledAway, setIsScrolledAway] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const messageRefs = useRef({});
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const [previousLanguage, setPreviousLanguage] = useState(chatUser.language);
  const [reactionAnchorEl, setReactionAnchorEl] = useState(null);
  const [selectedMessageForReaction, setSelectedMessageForReaction] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [imageZoom, setImageZoom] = useState(1);
  const stompClientRef = useRef(null);

  const pulseAnimation = keyframes`
    0% {
      box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.4);
    }
    50% {
      box-shadow: 0 0 0 10px rgba(255, 0, 0, 0);
      background-color: #FFCCCB; // Light red for contrast
    }
    100% {
      box-shadow: 0 0 0 0 rgba(255, 0, 0, 0);
      background-color: inherit; // Return to original background color
    }
  `;

  const scrollToBottom = useCallback(() => {
    if (isAtBottom) {
        // Check if the number of messages exceeds a certain threshold
        const scrollThreshold = 50; // Adjust this value as needed
        const behavior = messages.length > scrollThreshold ? 'auto' : 'smooth';
        messagesEndRef.current?.scrollIntoView({ behavior });
    }
  }, [isAtBottom, messages.length]);

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const chatContainer = chatContainerRef.current;
    if (chatContainer) {
      const handleScroll = () => {
        const { scrollTop, scrollHeight, clientHeight } = chatContainer;
        const isBottom = scrollHeight - scrollTop - clientHeight < 1;
        setIsAtBottom(isBottom);
        
        // Check if scrolled away (e.g., more than 300px from bottom)
        const scrollThreshold = 300;
        setIsScrolledAway(scrollHeight - scrollTop - clientHeight > scrollThreshold);
        
        // If scrolled to bottom, reset hasNewMessages
        if (isBottom) {
          setHasNewMessages(false);
        }
      };

      chatContainer.addEventListener('scroll', handleScroll);
      return () => chatContainer.removeEventListener('scroll', handleScroll);
    }
  }, []);

  useEffect(() => {
    if (!chatUser) return;
    const chatId = [currentUser.uid, chatUser.userId].sort().join('_');
    axios.get(`/api/messages/${chatId}`)
      .then(res => {
        // Sort messages by timestamp to ensure proper order (oldest to newest)
        const sortedMessages = res.data.sort((a, b) => {
          return new Date(a.timestamp) - new Date(b.timestamp);
        });
        setMessages(sortedMessages);
        setHasNewMessages(false);
      })
      .catch(console.error);
      
    // Set up WebSocket connection for real-time messages
    const socket = new SockJS('/ws');
    const client = new Client({
      webSocketFactory: () => socket,
      reconnectDelay: 5000,
      debug: process.env.NODE_ENV === 'development' ? console.log : false
    });
    
    client.onConnect = () => {
      console.log('Connected to chat WebSocket');
      
      // Subscribe to messages for this specific chat
      client.subscribe(`/topic/messages/${chatId}`, async (message) => {
        try {
          const receivedMessage = JSON.parse(message.body);
          console.log('Received message via WebSocket:', receivedMessage);
          
          // Fetch latest language preference before processing new messages
          let latestLanguage = contactLanguage;
          try {
            const userResponse = await axios.get(`/api/users/${chatUser.userId}`);
            latestLanguage = userResponse.data.language;
            
            // Update contact language if needed
            if (latestLanguage !== contactLanguage) {
              setContactLanguage(latestLanguage);
            }
          } catch (error) {
            console.error('Error fetching latest language:', error);
          }
          
          // Process the message with the latest language preference
          setMessages(prevMessages => {
            // Check if we already have this message
            const existingMessageIndex = prevMessages.findIndex(msg => msg.messageId === receivedMessage.messageId);
            
            // If new message needs translation (not from current user and has original content)
            if (existingMessageIndex === -1 && 
                receivedMessage.senderId !== currentUser.uid && 
                receivedMessage.originalContent) {
              
              // Start translating immediately with latest language
              translateToLanguage(
                receivedMessage.originalContent,
                latestLanguage,
                currentUser.translator || 'google'
              ).then(translation => {
                // Update the translated message
                setMessages(prev => 
                  prev.map(msg => 
                    msg.messageId === receivedMessage.messageId
                      ? {...msg, content: translation}
                      : msg
                  )
                );
              }).catch(error => {
                console.error('Error translating new message:', error);
              });
            }
            
            // If message doesn't exist, add it to the list
            if (existingMessageIndex === -1) {
              // If not at the bottom of chat, show new message notification
              if (!isAtBottom && receivedMessage.senderId !== currentUser.uid) {
                setHasNewMessages(true);
              }
              return [...prevMessages, receivedMessage];
            }
            
            // Update an existing message (useful for reactions, status changes, etc)
            const updatedMessages = [...prevMessages];
            updatedMessages[existingMessageIndex] = receivedMessage;
            return updatedMessages;
          });
        } catch (error) {
          console.error('Error handling WebSocket message:', error);
        }
      });
    };
    
    client.onStompError = (frame) => {
      console.error('STOMP error:', frame);
    };
    
    // Activate WebSocket connection
    client.activate();
    stompClientRef.current = client;
    
    // Clean up function
    return () => {
      if (stompClientRef.current?.connected) {
        console.log('Disconnecting from chat WebSocket');
        stompClientRef.current.deactivate();
      }
    };
  }, [currentUser, chatUser, isAtBottom, contactLanguage]);

  useEffect(() => {
    if (!chatUser) return;
    
    // Set up WebSocket connection for real-time user updates
    const userSocket = new SockJS('/ws');
    const userClient = new Client({
      webSocketFactory: () => userSocket,
      reconnectDelay: 5000,
      debug: process.env.NODE_ENV === 'development' ? console.log : false
    });
    
    userClient.onConnect = () => {
      console.log('Connected to user updates WebSocket');
      
      // Subscribe to specific user updates
      userClient.subscribe(`/topic/users/${chatUser.userId}`, (message) => {
        try {
          const updatedUser = JSON.parse(message.body);
          console.log('Received user update via WebSocket:', updatedUser);
          
          // Update chat user's language if it changed
          if (updatedUser.language && updatedUser.language !== contactLanguage) {
            setContactLanguage(updatedUser.language);
            setPreviousLanguage(contactLanguage);
            setShowLanguageNotification(true);
            setTimeout(() => setShowLanguageNotification(false), 5000);
          }
          // Update chat user's status in real-time
          if (updatedUser.status) {
            setChatUserStatus(updatedUser.status);
          }
        } catch (error) {
          console.error('Error handling WebSocket message:', error);
        }
      });
    };
    
    userClient.activate();
    
    // Always fetch the latest user data from the server to ensure we have the most recent language setting
    axios.get(`/api/users/${chatUser.userId}`)
      .then(res => {
        if (res.data.language !== contactLanguage) {
          setContactLanguage(res.data.language);
          setPreviousLanguage(chatUser.language);
          setShowLanguageNotification(true);
          setTimeout(() => setShowLanguageNotification(false), 5000);
        }
      })
      .catch(console.error);
    
    return () => {
      if (userClient?.connected) {
        userClient.deactivate();
      }
    };
  }, [chatUser?.userId]); // Only re-run when the chat user changes

  useEffect(() => {
    if (!chatUser) return;
    // Language (assumed stored in chatUser.language)
    setContactLanguage(chatUser.language);
    setPreviousLanguage(chatUser.language);
    // Status from status endpoint
    axios.get('/api/status')
      .then(res => {
        setChatUserStatus(res.data[chatUser.userId] || 'offline');
        // Store initial status map for sidebar
        setUserStatuses(prev => ({ ...prev, [chatUser.userId]: res.data[chatUser.userId] }));
      })
      .catch(console.error);
  }, [chatUser]);

  const handleSendMessage = useCallback(async () => {
    if (!newMessage.trim() || isSending) return;

    setShouldScrollToBottom(true);
    setIsSending(true);
    const messageToSend = newMessage.trim();
    setNewMessage('');
    
    const chatId = [currentUser.uid, chatUser.userId].sort().join('_');
    const initialPayload = {
      chatId,
      senderId: currentUser.uid,
      messageOG: messageToSend,
      message: 'Translating...',
      type: 'text',
      replyToMessageId: replyingTo?.messageId,
      replyToSenderId: replyingTo?.senderId,
      replyToMessage: replyingTo?.message,
      replyToType: replyingTo?.type || null,
    };
    setReplyingTo(null);
    
    try {
      // First save the initial message with "Translating..." text
      // We'll let the WebSocket update handle adding this message to the UI
      // to prevent duplicates when the websocket message arrives
      const { data: saved } = await axios.post('/api/messages', initialPayload);
      
      // Track the message ID so we can update it with the translation
      const messageId = saved.messageId;
      
      // Get the translation
      const translated = await translateToLanguage(
        messageToSend,
        contactLanguage,
        currentUser.language,
        false
      );
      
      // Create an updated message object with the translations
      const updatedMessage = {
        ...saved,
        message: translated.message,
        messageVar1: translated.messageVar1,
        messageVar2: translated.messageVar2,
        messageVar3: translated.messageVar3
      };
      
      // Update the message in the backend using the PUT endpoint
      // Again, let the WebSocket handle the UI update
      try {
        await axios.put(
          `/api/messages/${messageId}`, 
          updatedMessage
        );
      } catch (updateError) {
        console.error('Error updating message with translation:', updateError);
      }
      
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsSending(false);
    }
  }, [newMessage, currentUser, chatUser, contactLanguage, isSending, replyingTo]);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTimestamp = (timestamp) => {
    const messageDate = new Date(timestamp);
    const now = new Date();

    const isToday = messageDate.toDateString() === now.toDateString();
    const isYesterday = messageDate.toDateString() === new Date(now.setDate(now.getDate() - 1)).toDateString();

    const timeString = messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

    if (isToday) {
      return `Today ${timeString}`;
    } else if (isYesterday) {
      return `Yesterday ${timeString}`;
    } else {
      const dateString = messageDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
      return `(${dateString}) ${timeString}`;
    }
  };

  const handleMessageClick = (event, message) => {
    if (message.senderId !== currentUser.uid) {
      setAnchorEl(event.currentTarget);
      setSelectedMessageId(message.messageId);
    } else {
      // Toggle timestamp visibility for current user's messages
      setShownTimestamps(prev => {
        const newSet = new Set(prev);
        if (newSet.has(message.messageId)) {
          newSet.delete(message.messageId);
        } else {
          newSet.add(message.messageId);
        }
        return newSet;
      });
    }
  };

  const handleCloseMenu = () => {
    setAnchorEl(null);
    setSelectedMessageId(null);
    // We no longer clear all shown timestamps here
  };

  const handleMenuOption = async (option, messageId) => {
    handleCloseMenu();
    const chatId = [currentUser.uid, chatUser.userId].sort().join('_');
    if (option === 'regenerate') {
        setShouldScrollToBottom(false);
        const startTime = Date.now();
        setRegeneratingTranslation(messageId);
        const currentMsg = messages.find(msg => msg.messageId === messageId);
        let updatedMsg;
        try {
            if (currentMsg.message === currentMsg.messageVar1) {
                const { data } = await axios.put(
                    `/api/messages/${messageId}/regenerate`,
                    { variation: 'messageVar2' }
                );
                updatedMsg = data;
            } else if (currentMsg.message === currentMsg.messageVar2) {
                const { data } = await axios.put(
                    `/api/messages/${messageId}/regenerate`,
                    { variation: 'messageVar3' }
                );
                updatedMsg = data;
            } else {
                const resp = await axios.get(`/api/users/${chatUser.userId}`);
                const latestLanguage = resp.data.language;
                const translation = await translateToLanguage(
                    currentMsg.messageOG,
                    latestLanguage,
                    currentUser.translator || 'google'
                );
                updatedMsg = {
                    ...currentMsg,
                    message: translation.messageVar1,
                    messageVar1: translation.messageVar1,
                    messageVar2: translation.messageVar2,
                    messageVar3: translation.messageVar3
                };
            }
            setMessages(prev =>
                prev.map(msg =>
                    msg.messageId === updatedMsg.messageId ? updatedMsg : msg
                )
            );
        } catch (error) {
            console.error("Error regenerating translation:", error);
        } finally {
            const elapsed = Date.now() - startTime;
            if (elapsed < 1000) {
                await new Promise(res => setTimeout(res, 1000 - elapsed));
            }
            setRegeneratingTranslation(null);
        }
    } else if (option === 'toggleOriginal') {
      setShowOriginalFor(prev => prev === messageId ? null : messageId);
    }
  };

  const handleUserInfoClick = () => {
    setIsUserInfoModalOpen(true);
  };

  const handleMouseEnter = (messageId) => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredMessageId(messageId);
    }, 1000); // 1000 milliseconds = 1 second
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setHoveredMessageId(null);
  };

  const markMessagesAsRead = useCallback(() => {
    if (chatUser && isAtBottom) {
      const chatId = [currentUser.uid, chatUser.userId].sort().join('_');
      // Use axios to call Spring Boot endpoint instead of Firebase
      axios.put(`/api/messages/${chatId}/read`, {
        receiverId: currentUser.uid
      })
      .catch(error => {
        console.error('Error marking messages as read:', error);
      });
    }
  }, [currentUser.uid, chatUser, isAtBottom]);

  useEffect(() => {
    markMessagesAsRead();
  }, [markMessagesAsRead, messages, isAtBottom]);

  const handleScrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollButton(false);
    setIsAtBottom(true);
    setHasNewMessages(false);
    markMessagesAsRead();
  };

  const handleReply = (message) => {
    console.log('Replying to message:', message);
    setReplyingTo({
      messageId: message.messageId,
      message: message.type === 'image' ? 'Photo' : (message.message || message.messageOG),
      senderId: message.senderId,
      type: message.type || 'text'
    });
    // Focus the message input
    document.querySelector('input[placeholder="Type your message..."]')?.focus();
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  const scrollToMessage = (messageId) => {
    const messageElement = messageRefs.current[messageId];
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(messageId);
      setTimeout(() => setHighlightedMessageId(null), 5000); // Remove highlight after 5 seconds
    }
  };

  const handleReplyClick = (replyToMessageId) => {
    console.log('Scrolling to message:', replyToMessageId);
    scrollToMessage(replyToMessageId);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'online':
        return '#66BB6A';
      case 'busy':
        return '#f44336';
      case 'away':
        return '#ffa726';
      default:
        return '#747f8d';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'online':
        return <CircleIcon sx={{ fontSize: 12, color: '#66BB6A' }} />;
      case 'busy':
        return <DoNotDisturbOnIcon sx={{ 
          fontSize: 12, 
          color: '#f44336',
          backgroundColor: '#f44336',
          borderRadius: '50%',
          '& path:first-of-type': {
            fill: 'white',
          }
        }} />;
      case 'away':
        return <AccessTimeIcon sx={{ 
          fontSize: 12, 
          color: '#ffa726',
          backgroundColor: '#ffa726',
          borderRadius: '50%',
          '& path': {
            fill: 'white',
          }
        }} />;
      default:
        return <CircleIcon sx={{ fontSize: 12, color: '#747f8d' }} />;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'online':
        return 'Online';
      case 'busy':
        return 'Busy';
      case 'away':
        return 'Away';
      default:
        return 'Offline';
    }
  };

  const handleReactionClick = (messageId) => {
    const message = messages.find(msg => msg.messageId === messageId);
    if (message) {
      setSelectedMessageForReaction(message);
      setReactionAnchorEl(document.getElementById(`message-${messageId}`));
      handleCloseMenu();
    }
  };

  const handleImageSelect = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedImage(file);
      handleSendImage(file);
    }
  };

  const handleSendImage = async (file) => {
    if (!file || isUploadingImage) return;
    setIsUploadingImage(true);
    
    const chatId = [currentUser.uid, chatUser.userId].sort().join('_');
    
    try {
      // Create a FormData object to send the image file
      const formData = new FormData();
      formData.append('file', file);
      formData.append('chatId', chatId);
      formData.append('senderId', currentUser.uid);
      
      if (replyingTo) {
        formData.append('replyToMessageId', replyingTo.messageId);
        formData.append('replyToSenderId', replyingTo.senderId);
        formData.append('replyToMessage', replyingTo.type === 'image' ? 'Photo' : replyingTo.message);
        formData.append('replyToType', replyingTo.type || null);
      }
      
      // Upload image to the Spring Boot backend
      // Let the WebSocket handle adding the message to the UI
      await axios.post('/api/messages/image', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      setReplyingTo(null);
      setPreviewImage(null);
      setSelectedImage(null);
    } catch (error) {
      console.error("Error uploading image:", error);
      // Handle error (e.g., show notification)
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleImagePreview = (imageUrl) => {
    setPreviewImage(imageUrl);
    setImageZoom(1); // Reset zoom when opening new image
  };

  const handleClosePreview = () => {
    setPreviewImage(null);
    setImageZoom(1);
  };

  const handleZoomIn = () => {
    setImageZoom(prev => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setImageZoom(prev => Math.max(prev - 0.25, 0.5));
  };

  // Update message translation function to always use latest language
  const translateMessage = async (messageObj, regenerate = false) => {
    if (!messageObj.messageOG || messageObj.senderId === currentUser.uid) {
        return;
    }
    try {
        const response = await axios.get(`/api/users/${chatUser.userId}`);
        const latestLanguage = response.data.language;
        if (latestLanguage !== contactLanguage) {
            setContactLanguage(latestLanguage);
        }
        setRegeneratingTranslation(messageObj.messageId);
        const translation = await translateToLanguage(
            messageObj.messageOG,
            latestLanguage,
            currentUser.translator || 'google'
        );
        setMessages(prevMessages =>
            prevMessages.map(msg =>
                msg.messageId === messageObj.messageId
                    ? {
                        ...msg,
                        message: translation.message || translation,
                        messageVar1: translation.messageVar1,
                        messageVar2: translation.messageVar2,
                        messageVar3: translation.messageVar3
                    }
                    : msg
            )
        );
        setRegeneratingTranslation(null);
    } catch (error) {
        console.error("Error translating message:", error);
        setRegeneratingTranslation(null);
    }
  };

  return (
    <Box sx={{ 
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      bgcolor: theme.palette.mode === 'dark' 
        ? '#150016' 
        : 'transparent',
      position: 'relative',
    }}>
      {/* Chat Header */}
      <Box sx={{
        p: 2,
        display: 'flex',
        alignItems: 'center',
        borderBottom: '1px solid',
        borderColor: theme.palette.mode === 'dark' 
          ? '#522C5D' 
          : 'rgba(255, 255, 255, 0.2)',
        background: theme.palette.mode === 'dark'
          ? 'linear-gradient(135deg, #29104A 0%, #522C5D 100%)'
          : 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(10px)',
      }}>
        <Box sx={{ position: 'relative', mr: 2 }}>
          <Avatar
            src={chatUser.profileImageUrl}
            sx={{ width: 40, height: 40, cursor: 'pointer' }}
            onClick={() => setIsUserInfoModalOpen(true)}
          />
          <Box
            sx={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: 12,
              height: 12,
              backgroundColor: 'transparent',
              borderRadius: '50%',
              border: '2px solid #7a49a5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              '& .MuiSvgIcon-root': {
                width: '100%',
                height: '100%',
              }
            }}
          >
            {getStatusIcon(chatUserStatus)}
          </Box>
        </Box>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 500, color: theme.palette.text.primary }}>
            {chatUser.username}
          </Typography>
          <Typography variant="caption" sx={{ color: getStatusColor(chatUserStatus), display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {getStatusText(chatUserStatus)}
          </Typography>
        </Box>
        <Box sx={{ ml: 'auto' }}>
          <IconButton onClick={onClose} sx={{ color: theme.palette.text.secondary }}>
            <CloseIcon />
          </IconButton>
        </Box>
      </Box>

      <Box ref={chatContainerRef} sx={{ 
        flexGrow: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        background: theme.palette.mode === 'dark' 
          ? 'linear-gradient(180deg, #29104A 0%, #522C5D 50%, #845162 100%)' 
          : 'transparent',
        p: 3,
        maxHeight: replyingTo ? 'calc(100vh - 200px)' : 'calc(100vh - 160px)',
        '&::-webkit-scrollbar': {
          width: '8px',
        },
        '&::-webkit-scrollbar-track': {
          background: 'transparent',
        },
        '&::-webkit-scrollbar-thumb': {
          background: theme.palette.mode === 'dark' 
            ? 'linear-gradient(180deg, #845162 0%, #E3B8B1 100%)' 
            : 'rgba(126, 96, 191, 0.5)',
          borderRadius: '4px',
        },
      }}>
        {messages.map((msg, index) => {
          const showAvatar = index === messages.length - 1 || messages[index + 1]?.senderId !== msg.senderId;
          const isLastMessageFromContact = (index === messages.length - 1 || messages[index + 1]?.senderId !== msg.senderId) && msg.senderId !== currentUser.uid;
          const isLastMessageFromCurrentUser = (index === messages.length - 1 || messages[index + 1]?.senderId !== msg.senderId) && msg.senderId === currentUser.uid;
          const isCurrentUserMessage = msg.senderId === currentUser.uid;
          const messageToDisplay = isCurrentUserMessage ? msg.messageOG : (msg.message || msg.messageOG);
          const isTranslating = !isCurrentUserMessage && msg.message === "Translating...";
          const messageReactions = msg.reactions ? Object.values(msg.reactions) : [];

          return (
            <Grid
              container
              spacing={2}
              key={index}
              ref={el => messageRefs.current[msg.messageId] = el}
              justifyContent={isCurrentUserMessage ? 'flex-end' : 'flex-start'}
              alignItems="flex-end"
              sx={{ 
                mb: 2, 
                position: 'relative',
              }}
              onMouseEnter={() => handleMouseEnter(msg.messageId)}
              onMouseLeave={handleMouseLeave}
            >
              {!isCurrentUserMessage && (
                <Grid item sx={{ width: 40, visibility: showAvatar ? 'visible' : 'hidden' }}>
                  {showAvatar && (
                    <Avatar 
                      src={chatUser.profileImageUrl} 
                      sx={{ width: 32, height: 32 }}
                    />
                  )}
                </Grid>
              )}
              <Grid 
                item 
                xs="auto"
                sx={{ 
                  maxWidth: { xs: 'calc(100% - 48px)', sm: 'calc(60% - 48px)', md: 'calc(50% - 48px)' },
                  minWidth: '50px',
                  position: 'relative'
                }}
              >
                <Box
                  id={`message-${msg.messageId}`}
                  sx={{
                    px: 2,
                    py: 1.5,
                    backgroundColor: isCurrentUserMessage
                      ? theme.palette.mode === 'dark'
                        ? 'rgba(82, 44, 93, 0.85)'
                        : theme.palette.primary.main
                      : theme.palette.mode === 'dark'
                        ? 'rgba(132, 81, 98, 0.75)'
                        : '#E5D9F2',
                    color: isCurrentUserMessage 
                      ? '#fff' 
                      : theme.palette.text.primary,
                    borderRadius: '16px',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
                    position: 'relative',
                    wordWrap: 'break-word',
                    maxWidth: '100%',
                    display: 'inline-block',
                    transition: 'all 0.3s ease-in-out',
                    overflowWrap: 'break-word',
                    wordBreak: 'break-word',
                    hyphens: 'auto',
                    animation: highlightedMessageId === msg.messageId ? `${pulseAnimation} 5s ease-in-out` : 'none',
                    '&:before': (!isCurrentUserMessage && isLastMessageFromContact) ? {
                      content: '""',
                      position: 'absolute',
                      bottom: 8,
                      left: -6,
                      width: 0,
                      height: 0,
                      borderTop: '8px solid transparent',
                      borderRight: theme.palette.mode === 'dark' 
                        ? `8px solid rgba(132, 81, 98, 0.75)`
                        : `8px solid #E5D9F2`,
                      borderBottom: '8px solid transparent',
                    } : (isCurrentUserMessage && isLastMessageFromCurrentUser) ? {
                      content: '""',
                      position: 'absolute',
                      bottom: -8,
                      right: 10,
                      width: 0,
                      height: 0,
                      borderTop: theme.palette.mode === 'dark'
                        ? `9px solid rgba(82, 44, 93, 0.85)`
                        : `9px solid ${theme.palette.primary.main}`,
                      borderLeft: '8px solid transparent',
                      borderRight: '8px solid transparent',
                    } : undefined,
                  }}
                  onClick={(e) => handleMessageClick(e, msg)}
                >
                  {msg.replyToMessageId && (
                    <Box 
                      sx={{ 
                        backgroundColor: 'rgba(0, 0, 0, 0.05)', 
                        borderLeft: '3px solid #AD49E1', 
                        padding: '4px 8px', 
                        marginBottom: '4px', 
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReplyClick(msg.replyToMessageId);
                      }}
                    >
                      <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                        {msg.replyToSenderId === currentUser.uid ? 'You' : chatUser.username}
                      </Typography>
                      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                        {msg.replyToType === 'image' ? 'Photo' : msg.replyToMessage}
                      </Typography>
                    </Box>
                  )}
                  {regeneratingTranslation === msg.messageId ? (
                    <TranslationAnimation />
                  ) : isTranslating ? (
                    <TranslationAnimation />
                  ) : (
                    msg.type === 'image' ? (
                      <Box
                        component="img"
                        src={msg.imageUrl}
                        alt="Chat image"
                        sx={{
                          maxWidth: '100%',
                          maxHeight: '300px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          '&:hover': {
                            opacity: 0.9,
                          },
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleImagePreview(msg.imageUrl);
                        }}
                      />
                    ) : (
                      <Typography variant="body1" sx={{ wordBreak: 'break-word' }}>
                        {messageToDisplay}
                      </Typography>
                    )
                  )}
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      display: 'block', 
                      mt: 0.5,
                      color: 'rgba(0, 0, 0, 0.6)',
                      maxHeight: showOriginalFor === msg.messageId ? '100px' : '0px',
                      opacity: showOriginalFor === msg.messageId ? 1 : 0,
                      overflow: 'hidden',
                      transition: 'all 0.3s ease-in-out',
                    }}
                  >
                    {msg.messageOG}
                  </Typography>
                </Box>

                <MessageReactions
                  messageReactions={msg.reactions ? Object.values(msg.reactions) : []}
                  messageId={msg.messageId}
                  currentUser={currentUser}
                  chatUser={chatUser}
                  groupId={[currentUser.uid, chatUser.userId].sort().join('_')}
                  isCurrentUserMessage={isCurrentUserMessage}
                  reactionAnchorEl={reactionAnchorEl}
                  selectedMessageForReaction={selectedMessageForReaction}
                  onCloseReactionMenu={() => {
                    setSelectedMessageForReaction(null);
                    setReactionAnchorEl(null);
                  }}
                  onReactionClick={handleReactionClick}
                />

                <Typography 
                  variant="caption" 
                  sx={{ 
                    position: 'absolute',
                    [isCurrentUserMessage ? 'left' : 'right']: '-90px',
                    bottom: 0,
                    whiteSpace: 'nowrap',
                    color: 'rgba(0, 0, 0, 0.7)',
                    opacity: hoveredMessageId === msg.messageId ? 1 : 0,
                    visibility: hoveredMessageId === msg.messageId ? 'visible' : 'hidden',
                    transition: 'opacity 0.3s ease-in-out, visibility 0.3s ease-in-out',
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                    fontSize: '0.75rem',
                  }}
                >
                  {msg.timestamp ? formatTimestamp(msg.timestamp) : 'Sending...'}
                </Typography>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReply(msg);
                  }}
                  sx={{
                    position: 'absolute',
                    top: '50%',
                    [isCurrentUserMessage ? 'left' : 'right']: '-28px',
                    transform: 'translateY(-50%)',
                    opacity: hoveredMessageId === msg.messageId ? 1 : 0,
                    transition: 'opacity 0.2s',
                  }}
                >
                  <ReplyIcon fontSize="small" />
                </IconButton>
              </Grid>
            </Grid>
          );
        })}

        <div ref={messagesEndRef} />
      </Box>

      {isScrolledAway && (
        <Fab
          color="primary"
          variant={hasNewMessages ? "extended" : "circular"}
          size={hasNewMessages ? "medium" : "small"}
          onClick={handleScrollToBottom}
          sx={{
            position: 'absolute',
            bottom: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#8967B3',
            '&:hover': { backgroundColor: '#7A1CAC' },
            zIndex: 1000,
            boxShadow: '0px 3px 5px -1px rgba(0,0,0,0.2), 0px 6px 10px 0px rgba(0,0,0,0.14), 0px 1px 18px 0px rgba(0,0,0,0.12)',
          }}
        >
          <KeyboardArrowDownIcon sx={{ mr: hasNewMessages ? 1 : 0 }} />
          {hasNewMessages && "New Messages"}
        </Fab>
      )}

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleCloseMenu}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'center',
          horizontal: 'left',
        }}
        sx={{
          '& .MuiPaper-root': {
            backgroundColor: theme.palette.mode === 'dark' 
              ? '#2f3136' 
              : '#CDC1FF',
            borderRadius: 2,
            boxShadow: '0px 3px 8px rgba(0, 0, 0, 0.2)',
            minWidth: 180,
            border: `1px solid ${theme.palette.divider}`,
          },
        }}
      >
        <MenuItem
          onClick={() => {
            const message = messages.find(msg => msg.messageId === selectedMessageId);
            if (message) {
              handleReply(message);
              handleCloseMenu();
            }
          }}
          sx={{
            fontSize: '14px',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            '&:hover': {
              backgroundColor: '#FFE1FF',
            },
          }}
        >
          <ReplyIcon fontSize="small" />
          Reply
        </MenuItem>
        {messages.find(msg => msg.messageId === selectedMessageId)?.messageVar2 && (
          <MenuItem
            onClick={() => handleMenuOption('regenerate', selectedMessageId)}
            sx={{
              fontSize: '14px',
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              '&:hover': {
                backgroundColor: '#FFE1FF',
              },
            }}
          >
            <AutorenewIcon fontSize="small" />
            Regenerate Translation
          </MenuItem>
        )}
        <MenuItem
          onClick={() => handleMenuOption('toggleOriginal', selectedMessageId)}
          sx={{
            fontSize: '14px',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            '&:hover': {
              backgroundColor: '#FFE1FF',
            },
          }}
        >
          <TranslateIcon fontSize="small" />
          {showOriginalFor === selectedMessageId ? 'Hide Original Message' : 'Show Original Message'}
        </MenuItem>
        <MenuItem
          onClick={() => handleReactionClick(selectedMessageId)}
          sx={{
            fontSize: '14px',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            '&:hover': {
              backgroundColor: '#FFE1FF',
            },
          }}
        >
          <AddReactionIcon fontSize="small" />
          Add Reaction
        </MenuItem>
      </Menu>

      <Box sx={{
        p: 2,
        background: theme.palette.mode === 'dark' 
          ? 'linear-gradient(180deg, #522C5D 0%, #29104A 100%)' 
          : 'rgba(255, 255, 255, 0.85)',
        borderTop: '1px solid',
        borderColor: theme.palette.mode === 'dark' 
          ? '#522C5D' 
          : 'rgba(255, 255, 255, 0.2)',
        boxShadow: theme.palette.mode === 'dark' 
          ? '0 -2px 8px rgba(21, 0, 22, 0.2)'
          : '0 -2px 8px rgba(0, 0, 0, 0.05)',
        backdropFilter: 'blur(10px)',
        position: 'relative',
        zIndex: 1,
        minHeight: replyingTo ? '120px' : '80px',
      }}>
        {replyingTo && (
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            backgroundColor: theme.palette.mode === 'dark' 
              ? 'rgba(255, 255, 255, 0.05)' 
              : '#f0f4f8', 
            padding: '8px', 
            borderRadius: '4px', 
            marginBottom: '8px'
          }}>
            <Typography variant="body2" sx={{ flexGrow: 1, marginRight: '8px' }}>
              Replying to: {replyingTo.type === 'image' ? 'Photo' : replyingTo.message}
            </Typography>
            <IconButton size="small" onClick={handleCancelReply}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            ref={fileInputRef}
            onChange={handleImageSelect}
          />
          <IconButton
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingImage}
            sx={{
              mr: 1,
              color: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'inherit',
            }}
          >
            {isUploadingImage ? (
              <CircularProgress size={24} />
            ) : (
              <ImageIcon />
            )}
          </IconButton>
          <TextField
            fullWidth
            variant="outlined"
            placeholder="Type your message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isSending}
            sx={{
              borderRadius: 2,
              backgroundColor: theme.palette.mode === 'dark' 
                ? 'rgba(255, 255, 255, 0.05)' 
                : '#f5f7fb',
              mr: 2,
              '& .MuiOutlinedInput-root': {
                color: 'text.primary',
                '& fieldset': {
                  borderColor: theme.palette.mode === 'dark' 
                    ? 'rgba(255, 255, 255, 0.2)' 
                    : '#ddd',
                },
                '&:hover fieldset': {
                  borderColor: theme.palette.primary.main,
                },
                '&.Mui-focused fieldset': {
                  borderColor: theme.palette.primary.main,
                },
              },
              '& .MuiInputBase-input::placeholder': {
                color: theme.palette.text.secondary,
                opacity: theme.palette.mode === 'dark' ? 0.5 : 0.7,
              },
            }}
          />
          <IconButton 
            color="primary" 
            onClick={handleSendMessage}
            disabled={isSending || newMessage.trim() === ''}
            sx={{ 
              backgroundColor: theme.palette.primary.main, 
              color: '#fff',
              '&:hover': { 
                backgroundColor: theme.palette.primary.dark 
              },
              '&.Mui-disabled': { 
                backgroundColor: theme.palette.mode === 'dark' 
                  ? 'rgba(255, 255, 255, 0.12)' 
                  : '#ccc' 
              },
            }}
          >
            {isSending ? <CircularProgress size={24} color="inherit" /> : <SendIcon />}
          </IconButton>
        </Box>
      </Box>

      <Snackbar
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        open={showLanguageNotification}
        autoHideDuration={3000}
        onClose={() => setShowLanguageNotification(false)}
        message={`${chatUser.username} has updated their language to ${contactLanguage}`}
        ContentProps={{
          sx: {
            backgroundColor: theme.palette.background.paper,
            color: theme.palette.text.primary,
          }
        }}
      />

      <UserInfoModal
        user={chatUser}
        open={isUserInfoModalOpen}
        onClose={() => setIsUserInfoModalOpen(false)}
      />

      <Dialog
        open={Boolean(previewImage)}
        onClose={handleClosePreview}
        maxWidth={false}
        sx={{
          '& .MuiDialog-paper': {
            backgroundColor: 'transparent',
            boxShadow: 'none',
            margin: 0,
            maxHeight: '100vh',
            maxWidth: '100vw',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          },
        }}
      >
        <DialogContent
          sx={{
            position: 'relative',
            p: 0,
            '&::-webkit-scrollbar': {
              display: 'none',
            },
            backgroundColor: 'transparent',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
          }}
          onClick={handleClosePreview}
        >
          <Box
            sx={{
              position: 'fixed',
              top: 16,
              right: 16,
              zIndex: 2,
              display: 'flex',
              gap: 1,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              borderRadius: '20px',
              padding: '4px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <IconButton
              size="small"
              onClick={handleZoomIn}
              sx={{ color: 'white' }}
            >
              <ZoomInIcon />
            </IconButton>
            <IconButton
              size="small"
              onClick={handleZoomOut}
              sx={{ color: 'white' }}
            >
              <ZoomOutIcon />
            </IconButton>
            <IconButton
              size="small"
              onClick={handleClosePreview}
              sx={{ color: 'white' }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
          <Box
            component="img"
            src={previewImage}
            alt="Preview"
            onClick={(e) => e.stopPropagation()}
            sx={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              transform: `scale(${imageZoom})`,
              transition: 'transform 0.2s ease-in-out',
              cursor: 'default',
            }}
          />
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default React.memo(ChatArea);