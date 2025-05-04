import React, { useState, useEffect } from 'react';
import { Box } from '@mui/material';
import axios from 'axios';
import ChatLayout from './ChatLayout';
import chatifyLogo from '../../assets/chatifylogo.png';

const ChatPage = ({ currentUser, handleLogout }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [userData, setUserData] = useState(currentUser);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!currentUser?.uid) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const response = await axios.get(`/api/users/${currentUser.uid}`);
        setUserData(prev => ({ ...prev, ...response.data, uid: prev.uid }));
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchUserData();
  }, [currentUser?.uid]);

  if (isLoading || !userData?.uid) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <img src={chatifyLogo} alt="Chatify Logo" style={{ width: '250px', height: 'auto' }} />
      </Box>
    );
  }

  return (
    <ChatLayout
      currentUser={userData}
      handleLogout={handleLogout}
    />
  );
};

export default ChatPage;
