import React, { useState, useEffect, useRef } from 'react';
import { Box, List, ListItem, ListItemText, Typography, Avatar, IconButton, Badge, ButtonGroup, Button, useTheme, Fab, AvatarGroup } from '@mui/material';
import axios from 'axios';
import SearchBar from './SearchBar';
import UserProfile from './UserProfile';
import { MessageOutlined, PeopleOutline } from '@mui/icons-material';
import CircleIcon from '@mui/icons-material/Circle';
import DoNotDisturbOnIcon from '@mui/icons-material/DoNotDisturbOn';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AddIcon from '@mui/icons-material/Add';
import CreateGroupDialog from './CreateGroupDialog';
import Groups from '@mui/icons-material/Groups';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';

const Sidebar = ({ currentUser, selectChatUser, handleLogout, activeChatUserId }) => {
  const theme = useTheme();
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [userConversations, setUserConversations] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [lastMessages, setLastMessages] = useState({});
  const [unreadMessages, setUnreadMessages] = useState({});
  const [selectedUserId, setSelectedUserId] = useState(null); // Track the selected user
  const [view, setView] = useState('recent'); // Filter: 'recent', 'all', or 'groups'
  const [userStatuses, setUserStatuses] = useState({});
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [groups, setGroups] = useState([]);
  const [clickedItemId, setClickedItemId] = useState(null);
  const stompClientRef = useRef(null);
  const processedMessageIdsRef = useRef(new Set());
  const subscribedGroupIdsRef = useRef(new Set());
  const fetchSidebarDataRef = useRef(null);

  useEffect(() => {
    async function fetchSidebarData() {
      try {
        // Fetch users, statuses, and groups in parallel
        const [usersRes, statusRes, groupsRes] = await Promise.all([
          axios.get('/api/users'),
          axios.get('/api/status'),
          axios.get('/api/groups'),
        ]);
        // Users list
        const allUsers = usersRes.data.filter(u => u.id !== currentUser.id).map(user => ({
          ...user,
          userId: user.id  // Map id to userId for consistent access
        }));
        setUsers(allUsers);
        // User statuses map
        setUserStatuses(statusRes.data);
        // Fetch members for each group
        const membersFetches = groupsRes.data.map(g => 
          axios.get(`/api/group-members/group/${g.id}`)
        );
        const membersResults = await Promise.all(membersFetches);
        // Enrich groups with member details
        const enrichedGroups = groupsRes.data.map((g, idx) => {
          const members = membersResults[idx].data.map(m => {
            const user = usersRes.data.find(u => u.id === m.userId);
            return {
              ...m,
              username: user?.username,
              profileImageUrl: user?.profileImageUrl
            };
          });
          const membersMap = {};
          members.forEach(m => {
            membersMap[m.userId] = {
              role: m.role,
              joinedAt: m.joinedAt,
              username: m.username,
              profileImageUrl: m.profileImageUrl
            };
          });
          return { ...g, members: membersMap };
        });
        setGroups(enrichedGroups);
      } catch (error) {
        console.error('Error fetching sidebar data:', error);
      }
    }
    fetchSidebarDataRef.current = fetchSidebarData;
    fetchSidebarData();
  }, [currentUser]);

  // Setup WebSocket connection for real-time user updates
  useEffect(() => {
    // Initialize STOMP client
    const socket = new SockJS('/ws');
    const client = new Client({
      webSocketFactory: () => socket,
      reconnectDelay: 5000,
    });

    // Track processed message IDs to prevent duplicates
    const processedMessageIds = processedMessageIdsRef.current;

    // On connection, subscribe to user updates
    client.onConnect = () => {
      // Subscribe to general user updates
      client.subscribe('/topic/users', (message) => {
        const updatedUser = JSON.parse(message.body);
        // Update user list
        setUsers(prev => {
          const exists = prev.some(u => u.userId === updatedUser.id);
          if (exists) {
            return prev.map(u =>
              u.userId === updatedUser.id
                ? {
                    ...u,
                    username: updatedUser.username || u.username,
                    profileImageUrl: updatedUser.profileImageUrl || u.profileImageUrl,
                    language: updatedUser.language || u.language,
                  }
                : u
            );
          } else {
            return [...prev, { ...updatedUser, userId: updatedUser.id }];
          }
        });
        // Update status map
        setUserStatuses(prev => ({
          ...prev,
          [updatedUser.id]: updatedUser.status,
        }));
      });

      // Subscribe only to direct messages involving current user
      const userChatTopic = `/user/${currentUser.uid}/messages`;
      console.log(`Subscribing to user messages topic: ${userChatTopic}`);
      
      client.subscribe(userChatTopic, (message) => {
        try {
          const msg = JSON.parse(message.body);
          console.log("New direct message received via WebSocket:", msg);
          
          // Skip if we've already processed this message or it's from current user
          if (processedMessageIds.has(msg.messageId) || msg.senderId === currentUser.uid) {
            console.log(`Skipping message ${msg.messageId} - already processed or from current user`);
            return;
          }
          
          // Mark message as processed
          processedMessageIds.add(msg.messageId);
          
          // Determine if this is a direct message or group message
          let itemId;
          if (msg.chatId.includes('_')) {
            // Direct message (format: 'user1_user2')
            const users = msg.chatId.split('_');
            const otherUserId = users.find(id => id !== currentUser.uid);
            itemId = otherUserId;
          } else {
            // Group message
            itemId = `group_${msg.chatId}`;
          }
          
          // Update last messages 
          setLastMessages(prev => ({
            ...prev,
            [itemId]: msg
          }));
          // Update conversations for recent tab
          setUserConversations(prev => ({
            ...prev,
            [itemId]: {
              hasConversation: true,
              latestMessageTimestamp: new Date(msg.timestamp).getTime(),
              latestMessage: msg.messageOG || msg.message
            }
          }));
          // Update unread count if not viewing this conversation
          if (activeChatUserId !== itemId) {
            console.log(`Incrementing unread count for ${itemId}`);
            setUnreadMessages(prev => {
              const current = prev[itemId] || { hasUnread: false, unreadCount: 0 };
              return {
                ...prev,
                [itemId]: {
                  hasUnread: true,
                  unreadCount: current.unreadCount + 1
                }
              };
            });
          }
        } catch (error) {
          console.error("Error processing WebSocket message:", error);
        }
      });
      
      // Subscribe to group membership changes
      client.subscribe(`/user/${currentUser.uid}/groups`, (message) => {
        try {
          console.log('Group membership change event:', message.body);
          fetchSidebarDataRef.current && fetchSidebarDataRef.current();
        } catch (err) {
          console.error('Error handling group membership WS message', err);
        }
      });

      // Keep the Set from growing too large by periodically clearing old message IDs
      // (after 1 minute, which should be plenty of time to catch duplicates)
      setInterval(() => {
        processedMessageIds.clear();
      }, 60000);
    };

    // Store client reference
    stompClientRef.current = client;
    
    // Activate connection
    client.activate();
    
    // Clean up on component unmount
    return () => {
      if (stompClientRef.current?.connected) {
        stompClientRef.current.deactivate();
      }
    };
  }, [currentUser.uid, activeChatUserId]);

  // Subscribe to group message topics for real-time recents
  useEffect(() => {
    const client = stompClientRef.current;
    if (!client?.connected) return;
    groups.forEach(group => {
      if (!subscribedGroupIdsRef.current.has(group.id)) {
        client.subscribe(`/topic/messages/${group.id}`, (message) => {
          const msg = JSON.parse(message.body);
          const processed = processedMessageIdsRef.current;
          if (processed.has(msg.messageId) || msg.senderId === currentUser.uid) return;
          processed.add(msg.messageId);
          const itemId = `group_${group.id}`;
          setLastMessages(prev => ({ ...prev, [itemId]: msg }));
          setUserConversations(prev => ({
            ...prev,
            [itemId]: {
              hasConversation: true,
              latestMessageTimestamp: new Date(msg.timestamp).getTime(),
              latestMessage: msg.messageOG || msg.message
            }
          }));
          if (activeChatUserId !== itemId) {
            setUnreadMessages(prev => {
              const current = prev[itemId] || { hasUnread: false, unreadCount: 0 };
              return {
                ...prev,
                [itemId]: { hasUnread: true, unreadCount: current.unreadCount + 1 }
              };
            });
          }
        });
        subscribedGroupIdsRef.current.add(group.id);
      }
    });
  }, [groups, activeChatUserId, currentUser.uid]);

  // Fetch conversation history to populate recent chats
  useEffect(() => {
    const fetchUserConversations = async () => {
      try {
        // Create conversations data - we'll check which users have message history with the current user
        const conversationsData = {};
        const lastMessagesData = {};
        const unreadMessagesData = {};
        
        // Process for direct messages - check message history with each user
        for (const user of users) {
          const chatId = [currentUser.uid, user.userId].sort().join('_');
          try {
            const response = await axios.get(`/api/messages/${chatId}`);
            const hasMessages = response.data && response.data.length > 0;
            
            if (hasMessages) {
              // Sort messages by timestamp to get the latest
              const sortedMessages = response.data.sort((a, b) => 
                new Date(b.timestamp) - new Date(a.timestamp)
              );
              const latestMessage = sortedMessages[0];
              console.log(`Latest message for ${user.username}:`, latestMessage);
              
              // Check if this message is unread
              const isUnread = latestMessage.senderId !== currentUser.uid && 
                               (!latestMessage.isRead && !latestMessage.read);
              
              conversationsData[user.userId] = {
                hasConversation: true,
                latestMessageTimestamp: new Date(latestMessage.timestamp).getTime(),
                latestMessage: latestMessage.messageOG || latestMessage.message
              };
              
              // Store unread state
              if (isUnread) {
                // Count how many unread messages
                const unreadCount = sortedMessages.filter(
                  msg => msg.senderId !== currentUser.uid && (!msg.isRead && !msg.read)
                ).length;
                
                unreadMessagesData[user.userId] = {
                  hasUnread: true,
                  unreadCount
                };
              }
              
              // Store the entire message object, not just the string
              lastMessagesData[user.userId] = latestMessage;
            }
          } catch (error) {
            // No messages with this user or error, skip
            console.log(`No messages with user ${user.userId}`);
          }
        }
        
        // Process for group chats
        for (const group of groups) {
          if (group.members && group.members[currentUser.uid]) {
            try {
              const response = await axios.get(`/api/messages/${group.id}`);
              const hasMessages = response.data && response.data.length > 0;
              
              if (hasMessages) {
                // Sort messages by timestamp to get the latest
                const sortedMessages = response.data.sort((a, b) => 
                  new Date(b.timestamp) - new Date(a.timestamp)
                );
                const latestMessage = sortedMessages[0];
                console.log(`Latest message for group ${group.name}:`, latestMessage);
                
                const groupId = `group_${group.id}`;
                
                conversationsData[groupId] = {
                  hasConversation: true,
                  latestMessageTimestamp: new Date(latestMessage.timestamp).getTime(),
                  latestMessage: latestMessage.messageOG || latestMessage.message
                };
                
                // Compute unread using last-read timestamp from localStorage
                const lastRead = parseInt(localStorage.getItem(`groupLastRead_${group.id}`)) || 0;
                const unreadList = sortedMessages.filter(
                  msg => msg.senderId !== currentUser.uid &&
                         new Date(msg.timestamp).getTime() > lastRead
                );
                if (unreadList.length > 0) {
                  unreadMessagesData[groupId] = {
                    hasUnread: true,
                    unreadCount: unreadList.length
                  };
                }
                
                // Store the entire message object
                lastMessagesData[groupId] = latestMessage;
              }
            } catch (error) {
              // No messages in this group or error, skip
              console.log(`No messages in group ${group.id}`);
            }
          }
        }
        
        // Update conversations state
        setUserConversations(conversationsData);
        // Update last messages with the full objects
        setLastMessages(lastMessagesData);
        // Update unread messages state
        setUnreadMessages(unreadMessagesData);
        console.log("Last messages data:", lastMessagesData);
        console.log("Unread messages data:", unreadMessagesData);
      } catch (error) {
        console.error('Error fetching conversation history:', error);
      }
    };
    
    // Only fetch if we have users and groups loaded
    if (users.length > 0 && groups.length > 0) {
      fetchUserConversations();
    }
  }, [users, groups, currentUser.uid]);

  const sortUsersByLatestMessage = (userList) => {
    return userList.sort((a, b) => {
      const timestampA = userConversations[a.userId]?.latestMessageTimestamp || 0;
      const timestampB = userConversations[b.userId]?.latestMessageTimestamp || 0;
      return new Date(timestampB) - new Date(timestampA);
    });
  };

  useEffect(() => {
    let itemsToDisplay = [];

    if (searchQuery.trim()) {
      const lowerCaseQuery = searchQuery.toLowerCase();
      if (view === 'groups') {
        itemsToDisplay = groups.filter(group =>
          group.members && group.members[currentUser.uid] &&
          group.name.toLowerCase().includes(lowerCaseQuery)
        );
      } else {
        itemsToDisplay = users.filter(user =>
          user.username.toLowerCase().includes(lowerCaseQuery) ||
          user.email.toLowerCase().includes(lowerCaseQuery)
        );
      }
    } else if (view === 'recent') {
      const recentUsers = users.filter(user => 
        userConversations[user.userId]?.hasConversation
      );
      const recentGroups = groups.filter(group => 
        userConversations[`group_${group.id}`]?.hasConversation &&
        group.members && group.members[currentUser.uid]
      );
      itemsToDisplay = [...recentUsers, ...recentGroups];
    } else if (view === 'all') {
      itemsToDisplay = users;
    } else if (view === 'groups') {
      itemsToDisplay = groups.filter(group =>
        group.members && group.members[currentUser.uid]
      );
    }

    const sortedItems = itemsToDisplay.sort((a, b) => {
      const timestampA = userConversations[a.userId || `group_${a.id}`]?.latestMessageTimestamp || 0;
      const timestampB = userConversations[b.userId || `group_${b.id}`]?.latestMessageTimestamp || 0;
      return timestampB - timestampA;
    });

    setFilteredUsers(sortedItems);
  }, [searchQuery, users, userConversations, view, groups, currentUser.uid]);

  const handleSearch = (query) => {
    setSearchQuery(query);
  };

  const handleUserSelect = (user) => {
    const userId = user.userId;
    setClickedItemId(userId);
    if (userId) {
      setUnreadMessages(prev => ({
        ...prev,
        [userId]: { hasUnread: false, unreadCount: 0 }
      }));
    }
    selectChatUser(user);
  };

  const handleGroupSelect = (group) => {
    const groupId = `group_${group.id}`;
    localStorage.setItem(`groupLastRead_${group.id}`, Date.now().toString());
    setClickedItemId(groupId);
    setUnreadMessages(prev => ({
      ...prev,
      [groupId]: { hasUnread: false, unreadCount: 0 }
    }));
    selectChatUser(group);
  };

  const truncateMessage = (message, maxLength = 30) => {
    if (!message) return ""; // Handle undefined or null messages
    if (message.length > maxLength) {
      return message.substring(0, maxLength) + '...';
    }
    return message;
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

  return (
    <Box sx={{ 
      height: '100vh',
      width: '100%',
      backgroundColor: theme.palette.mode === 'dark' 
        ? 'linear-gradient(180deg, #150016 0%, #29104A 100%)' 
        : 'linear-gradient(135deg, #FFE1FF, #E4B1F0, #7E60BF)',
      borderRight: '1px solid rgba(255, 255, 255, 0.2)',
      display: 'flex',
      flexDirection: 'column',
      backdropFilter: 'blur(10px)',
    }}>
      <Box sx={{ 
        p: 2,
        borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
        background: theme.palette.mode === 'dark' 
          ? 'linear-gradient(135deg, #29104A 0%, #522C5D 100%)' 
          : '#f5f5f5', // Light gray background
      }}>
        <SearchBar onSearch={handleSearch} />
        <ButtonGroup 
          fullWidth 
          size="small" 
          sx={{ 
            mt: 1,
            background: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : '#fff',
            borderRadius: '20px',
            padding: '2px',
            border: 'none',
            '& .MuiButton-root': {
              border: 'none',
              borderRadius: '18px !important',
              textTransform: 'none',
              fontWeight: 'normal',
            }
          }}
        >
          <Button
            variant={view === 'recent' ? 'contained' : 'outlined'}
            onClick={() => setView('recent')}
            startIcon={<MessageOutlined />}
            sx={{
              backgroundColor: view === 'recent' 
                ? theme.palette.mode === 'dark'
                  ? '#AD49E1'
                  : '#AD49E1'
                : 'transparent',
              color: theme.palette.mode === 'dark'
                ? view === 'recent' 
                  ? '#fff' 
                  : 'rgba(255, 255, 255, 0.7)'
                : view === 'recent' 
                  ? '#fff' 
                  : '#666',
              border: 'none',
              boxShadow: 'none',
              '&:hover': {
                backgroundColor: view === 'recent' 
                  ? theme.palette.mode === 'dark'
                    ? '#9A41C8'
                    : '#AD49E1'
                  : theme.palette.mode === 'dark'
                    ? 'rgba(255, 255, 255, 0.1)'
                    : 'rgba(0, 0, 0, 0.04)',
                boxShadow: 'none',
              },
            }}
          >
            Recent
          </Button>
          <Button
            variant={view === 'groups' ? 'contained' : 'outlined'}
            onClick={() => setView('groups')}
            startIcon={<Groups />}
            sx={{
              backgroundColor: view === 'groups' 
                ? theme.palette.mode === 'dark'
                  ? '#AD49E1'
                  : '#AD49E1'
                : 'transparent',
              color: theme.palette.mode === 'dark'
                ? view === 'groups' 
                  ? '#fff' 
                  : 'rgba(255, 255, 255, 0.7)'
                : view === 'groups' 
                  ? '#fff' 
                  : '#666',
              border: 'none',
              boxShadow: 'none',
              '&:hover': {
                backgroundColor: view === 'groups' 
                  ? theme.palette.mode === 'dark'
                    ? '#9A41C8'
                    : '#AD49E1'
                  : theme.palette.mode === 'dark'
                    ? 'rgba(255, 255, 255, 0.1)'
                    : 'rgba(0, 0, 0, 0.04)',
                boxShadow: 'none',
              },
            }}
          >
            Groups
          </Button>
          <Button
            variant={view === 'all' ? 'contained' : 'outlined'}
            onClick={() => setView('all')}
            startIcon={<PeopleOutline />}
            sx={{
              backgroundColor: view === 'all' 
                ? theme.palette.mode === 'dark'
                  ? '#AD49E1'
                  : '#AD49E1'
                : 'transparent',
              color: theme.palette.mode === 'dark'
                ? view === 'all' 
                  ? '#fff' 
                  : 'rgba(255, 255, 255, 0.7)'
                : view === 'all' 
                  ? '#fff' 
                  : '#666',
              border: 'none',
              boxShadow: 'none',
              '&:hover': {
                backgroundColor: view === 'all' 
                  ? theme.palette.mode === 'dark'
                    ? '#9A41C8'
                    : '#AD49E1'
                  : theme.palette.mode === 'dark'
                    ? 'rgba(255, 255, 255, 0.1)'
                    : 'rgba(0, 0, 0, 0.04)',
                boxShadow: 'none',
              },
            }}
          >
            All Users
          </Button>
        </ButtonGroup>
      </Box>

      <List sx={{ 
        flexGrow: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        background: theme.palette.mode === 'dark' 
          ? 'linear-gradient(180deg, #29104A 0%, #522C5D 50%, #845162 100%)' 
          : 'transparent',
        '&::-webkit-scrollbar': {
          width: '8px',
        },
        '&::-webkit-scrollbar-track': {
          background: theme.palette.mode === 'dark' ? '#29104A' : '#f1f1f1',
        },
        '&::-webkit-scrollbar-thumb': {
          background: theme.palette.mode === 'dark' 
            ? 'linear-gradient(180deg, #845162 0%, #E3B8B1 100%)' 
            : '#888',
          borderRadius: '4px',
        },
      }}>
        {view === 'groups' && (
          <Box sx={{ 
            p: 2, 
            display: 'flex', 
            justifyContent: 'flex-end', 
            alignItems: 'center',
            borderBottom: '1px solid',
            borderColor: theme.palette.mode === 'dark' ? '#522C5D' : 'divider',
          }}>
            <IconButton
              onClick={() => setCreateGroupOpen(true)}
              sx={{
                backgroundColor: theme.palette.mode === 'dark' ? '#8967B3' : 'primary.main',
                color: '#fff',
                '&:hover': { 
                  backgroundColor: theme.palette.mode === 'dark' ? '#7A1CAC' : 'primary.dark' 
                },
                width: 40,
                height: 40,
              }}
            >
              <AddIcon />
            </IconButton>
          </Box>
        )}
        {filteredUsers.map((item) => {
          const isGroup = item.type === 'group' || !item.userId;
          const itemId = isGroup ? `group_${item.id}` : item.userId;
          const lastMessage = lastMessages[itemId];

          return (
            <ListItem
              key={itemId}
              button
              selected={itemId === activeChatUserId}
              onClick={() => isGroup ? handleGroupSelect(item) : handleUserSelect(item)}
              sx={{
                mb: 0.5,
                borderRadius: 1,
                mx: 1,
                width: 'auto',
                backgroundColor: clickedItemId === itemId ? (
                  theme.palette.mode === 'dark'
                    ? 'rgba(173, 73, 225, 0.35)'
                    : 'rgba(173, 73, 225, 0.2)'
                ) : 'transparent',
                '&.Mui-selected': {
                  backgroundColor: theme.palette.mode === 'dark'
                    ? 'rgba(173, 73, 225, 0.2)'
                    : 'rgba(173, 73, 225, 0.1)',
                  borderLeft: `4px solid ${theme.palette.primary.main}`,
                  '&:hover': {
                    backgroundColor: theme.palette.mode === 'dark'
                      ? 'rgba(173, 73, 225, 0.3)'
                      : 'rgba(173, 73, 225, 0.2)',
                  }
                },
                '&:hover': {
                  backgroundColor: theme.palette.mode === 'dark'
                    ? 'rgba(173, 73, 225, 0.1)'
                    : 'rgba(173, 73, 225, 0.05)',
                }
              }}
            >
              <Box sx={{ position: 'relative', mr: 2 }}>
                {isGroup ? (
                  <AvatarGroup max={3} spacing="small" sx={{ width: 40, height: 40 }}>
                    {Object.values(item.members || {}).slice(0, 3).map((member, index) => (
                      <Avatar 
                        key={index} 
                        src={member.profileImageUrl}
                        sx={{ width: 24, height: 24 }}
                      />
                    ))}
                  </AvatarGroup>
                ) : (
                  <Avatar src={item.profileImageUrl || '/default-avatar.png'}>
                    {(!item.profileImageUrl || item.profileImageUrl === 'none') && item.username?.[0]}
                  </Avatar>
                )}
                {!isGroup && (
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
                    }}
                  >
                    {getStatusIcon(userStatuses[item.userId])}
                  </Box>
                )}
              </Box>
              <ListItemText
                primary={item.username || item.name}
                secondary={
                  lastMessage ? (
                    (() => {
                      console.log(`Rendering lastMessage for ${item.username || item.name}:`, lastMessage);
                      // Verify if lastMessage is a proper object with expected properties
                      if (typeof lastMessage === 'string') {
                        return truncateMessage(lastMessage);
                      }
                      
                      if (isGroup) {
                        // For group messages
                        if (lastMessage.type === 'image') {
                          return `${lastMessage.senderId === currentUser.uid ? 'You' : (lastMessage.senderName || 'User')} sent a photo`;
                        } else {
                          return lastMessage.senderId === currentUser.uid 
                            ? `You: ${lastMessage.messageOG || lastMessage.message || 'sent a message'}`
                            : truncateMessage(lastMessage.messageOG || lastMessage.message || 'sent a message');
                        }
                      } else {
                        // For direct messages
                        if (lastMessage.type === 'image') {
                          return `${lastMessage.senderId === currentUser.uid ? 'You' : item.username} sent a photo`;
                        } else {
                          return lastMessage.senderId === currentUser.uid
                            ? `You: ${truncateMessage(lastMessage.messageOG || lastMessage.message || "")}`
                            : truncateMessage(lastMessage.messageOG || lastMessage.message || "");
                        }
                      }
                    })()
                  ) : (
                    isGroup ? `${Object.keys(item.members || {}).length} members` : item.email
                  )
                }
                sx={{
                  minWidth: 0,
                  '& .MuiListItemText-primary, & .MuiListItemText-secondary': {
                    width: '100%',
                  },
                  '& .MuiListItemText-secondary': {
                    fontWeight: unreadMessages[itemId]?.hasUnread ? 'bold' : 'normal',
                  },
                }}
              />
              {unreadMessages[itemId]?.unreadCount > 0 && (
                <Badge
                  badgeContent={unreadMessages[itemId].unreadCount}
                  color="primary"
                  sx={{
                    position: 'absolute',
                    right: 25, 
                    top: '50%',
                    transform: 'translateY(-50%)',
                    flexShrink: 0,
                  }}
                />
              )}
            </ListItem>
          );
        })}
      </List>

      {view === 'groups' && filteredUsers.length === 0 && (
        <Box sx={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          height: '200px',
          p: 2,
          textAlign: 'center',
          mt: 4,
          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(41, 16, 74, 0.6)' : 'transparent',
          borderRadius: 2,
          mx: 2,
        }}>
          <Groups sx={{ 
            fontSize: 48, 
            color: theme.palette.mode === 'dark' ? '#8967B3' : 'text.secondary',
            mb: 2,
            opacity: 0.8,
          }} />
          <Typography 
            variant="body1" 
            sx={{ 
              color: theme.palette.mode === 'dark' ? '#E3B8B1' : 'text.secondary',
              mb: 1,
              fontWeight: 500,
            }}
          >
            No group chats yet
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => setCreateGroupOpen(true)}
            sx={{ 
              mt: 2,
              borderColor: theme.palette.mode === 'dark' ? '#8967B3' : 'primary.main',
              color: theme.palette.mode === 'dark' ? '#8967B3' : 'primary.main',
              '&:hover': {
                borderColor: theme.palette.mode === 'dark' ? '#AD49E1' : 'primary.dark',
                backgroundColor: theme.palette.mode === 'dark' 
                  ? 'rgba(173, 73, 225, 0.08)'
                  : 'rgba(122, 28, 172, 0.04)',
              },
              textTransform: 'none',
              borderRadius: '20px',
              px: 3,
              py: 1,
            }}
          >
            Create New Group
          </Button>
        </Box>
      )}

      <Box sx={{ 
        borderTop: '1px solid',
        borderColor: theme.palette.mode === 'dark' ? '#29104A' : 'divider',
        backgroundColor: theme.palette.mode === 'dark' ? '#150016' : '#ffffff',
      }}>
        <UserProfile currentUser={currentUser} handleLogout={handleLogout} />
      </Box>

      <CreateGroupDialog
        open={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
        currentUser={currentUser}
        users={users}
      />
    </Box>
  );
};

export default Sidebar;
