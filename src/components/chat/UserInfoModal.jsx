import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, Avatar, Typography, Box, IconButton, useTheme } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import EmailIcon from '@mui/icons-material/Email';
import LanguageIcon from '@mui/icons-material/Language';
import ReactCountryFlag from "react-country-flag";
import { useLanguage } from '../../contexts/Languages';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';

const UserInfoModal = ({ user, open, onClose }) => {
  const { languageToCountryCode } = useLanguage();
  const theme = useTheme();
  const [userData, setUserData] = useState(user);
  const stompClientRef = React.useRef(null);
  
  useEffect(() => {
    setUserData(user);
  }, [user]);
  
  useEffect(() => {
    if (!open || !user) return;
    
    // Set up WebSocket connection for real-time user updates
    const socket = new SockJS('/ws');
    const client = new Client({
      webSocketFactory: () => socket,
      reconnectDelay: 5000,
      debug: process.env.NODE_ENV === 'development' ? console.log : false
    });
    
    client.onConnect = () => {
      console.log('Connected to user updates WebSocket');
      
      // Subscribe to specific user updates
      client.subscribe(`/topic/users/${user.id}`, (message) => {
        try {
          const updatedUser = JSON.parse(message.body);
          console.log('Received user update via WebSocket:', updatedUser);
          setUserData(prevUser => ({
            ...prevUser,
            ...updatedUser
          }));
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
        console.log('Disconnecting from user updates WebSocket');
        stompClientRef.current.deactivate();
      }
    };
  }, [open, user]);
  
  if (!userData) return null;

  const countryCode = languageToCountryCode[userData.language];

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      PaperProps={{
        sx: {
          borderRadius: '16px',
          boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          background: theme.palette.mode === 'dark'
            ? 'linear-gradient(135deg, #150016 0%, #29104A 100%)'
            : 'linear-gradient(135deg, #FFE1FF, #E4B1F0, #7E60BF)',
          width: '300px',
          margin: 'auto',
          overflow: 'visible',
        }
      }}
    >
      <Box sx={{ 
        background: theme.palette.mode === 'dark'
          ? 'linear-gradient(135deg, #522C5D 0%, #845162 100%)'
          : '#AD49E1',
        height: '120px',
        position: 'relative',
        borderRadius: '16px 16px 0 0',
      }}>
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{
            position: 'absolute',
            right: 8,
            top: 8,
            color: '#FFE9D8',
          }}
        >
          <CloseIcon />
        </IconButton>
      </Box>
      <Avatar
        src={userData.profileImageUrl}
        sx={{ 
          width: 100,
          height: 100,
          border: '4px solid',
          borderColor: theme.palette.mode === 'dark' ? '#845162' : '#AD49E1',
          boxShadow: theme.palette.mode === 'dark'
            ? '0 4px 10px rgba(132, 81, 98, 0.3)'
            : '0 4px 10px rgba(173, 73, 225, 0.3)',
          position: 'absolute',
          top: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1,
        }}
      />
      <DialogContent sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        pt: 10,
        pb: 4,
        px: 2,
        position: 'relative',
        background: theme.palette.mode === 'dark'
          ? 'linear-gradient(180deg, #29104A 0%, #522C5D 100%)'
          : 'inherit',
      }}>
        <Typography 
          variant="h6" 
          sx={{ 
            fontWeight: 'bold', 
            mb: 3, 
            mt: 3,
            color: theme.palette.mode === 'dark' ? '#E3B8B1' : 'inherit',
          }}
        >
          {userData.username}
        </Typography>
        <Box sx={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'stretch', 
          gap: 2,
          backgroundColor: theme.palette.mode === 'dark' 
            ? 'rgba(132, 81, 98, 0.2)'
            : 'rgba(173, 73, 225, 0.1)',
          borderRadius: '12px',
          padding: '16px',
          width: '100%'
        }}>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 2,
            background: theme.palette.mode === 'dark'
              ? 'rgba(82, 44, 93, 0.6)'
              : 'white',
            borderRadius: '8px',
            padding: '10px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <EmailIcon sx={{ color: theme.palette.mode === 'dark' ? '#E3B8B1' : '#AD49E1' }} />
            <Typography 
              variant="body2" 
              sx={{ 
                wordBreak: 'break-all',
                color: theme.palette.mode === 'dark' ? '#FFE9D8' : 'inherit',
              }}
            >
              {userData.email}
            </Typography>
          </Box>
          {userData.language && (
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 2,
              background: theme.palette.mode === 'dark'
                ? 'rgba(82, 44, 93, 0.6)'
                : 'white',
              borderRadius: '8px',
              padding: '10px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
              {countryCode ? (
                <ReactCountryFlag
                  countryCode={countryCode}
                  svg
                  style={{
                    width: '1.5em',
                    height: '1.5em',
                  }}
                />
              ) : (
                <LanguageIcon sx={{ color: theme.palette.mode === 'dark' ? '#E3B8B1' : '#AD49E1' }} />
              )}
              <Typography 
                variant="body2"
                sx={{ 
                  color: theme.palette.mode === 'dark' ? '#FFE9D8' : 'inherit',
                }}
              >
                {userData.language}
              </Typography>
            </Box>
          )}
          {userData.language && (
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'flex-start', 
              gap: 1, 
              mt: 1, 
              backgroundColor: theme.palette.mode === 'dark'
                ? 'rgba(132, 81, 98, 0.15)'
                : 'rgba(173, 73, 225, 0.05)',
              borderRadius: '8px',
              padding: '10px',
            }}>
              <InfoOutlinedIcon sx={{ 
                color: theme.palette.mode === 'dark' ? '#E3B8B1' : '#AD49E1', 
                fontSize: 16, 
                mt: 0.5 
              }} />
              <Typography 
                variant="caption" 
                sx={{ 
                  color: theme.palette.mode === 'dark' ? '#FFE9D8' : '#666', 
                  fontStyle: 'italic', 
                  flex: 1 
                }}
              >
                All messages sent to this contact will be automatically translated to {userData.language}.
              </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default UserInfoModal;