import React, { useState, useEffect } from 'react';
import { Box, Typography, Avatar, IconButton, Button, Dialog, DialogActions, DialogContent, LinearProgress, TextField, Popover, List, ListItem, ListItemButton, useMediaQuery, useTheme as useMuiTheme, Switch, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import SettingsIcon from '@mui/icons-material/Settings';
import PersonIcon from '@mui/icons-material/Person';
import SecurityIcon from '@mui/icons-material/Security';
import NotificationsIcon from '@mui/icons-material/Notifications';
import LanguageIcon from '@mui/icons-material/Language';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import CloseIcon from '@mui/icons-material/Close';
import CircleIcon from '@mui/icons-material/Circle';
import DoNotDisturbOnIcon from '@mui/icons-material/DoNotDisturbOn';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import axios from 'axios';
import Cropper from 'react-easy-crop';
import { getCroppedImg } from './cropImage';
import { useLanguage } from '../../contexts/Languages';
import { useTheme as useCustomTheme } from '../../contexts/ThemeContext';
import UserSettings from './UserSettings';
import { useAuth } from '../../contexts/AuthContext';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';

const UserProfile = ({ currentUser, handleLogout: parentHandleLogout }) => {
  const [userData, setUserData] = useState({
    profileImageUrl: '/default-avatar.png',
    username: 'Anonymous User',
    language: '',
    status: 'offline',
  });
  const { updateUserProfile } = useAuth();
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [avatarFile, setAvatarFile] = useState(null); // State for selected avatar file
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [openCropDialog, setOpenCropDialog] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); // Progress state
  const [uploading, setUploading] = useState(false); // Flag to check if the image is being uploaded
  const [oldAvatarUrl, setOldAvatarUrl] = useState(''); // Store the old avatar URL
  const [anchorEl, setAnchorEl] = useState(null);
  const [searchTerm, setSearchTerm] = useState(''); // Anchor element for language popover
  const { darkMode, toggleDarkMode } = useCustomTheme();
  const theme = useMuiTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { languages } = useLanguage(); // Use the languages from the context
  const [filteredLanguages, setFilteredLanguages] = useState(languages);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedSetting, setSelectedSetting] = useState('My Account');
  const muiTheme = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [statusAnchorEl, setStatusAnchorEl] = useState(null);
  const stompClientRef = React.useRef(null);

  // Settings sections configuration
  const settingsSections = [
    { id: 'My Account', icon: <PersonIcon />, color: '#5865F2' },
    { id: 'Privacy & Safety', icon: <SecurityIcon />, color: '#3BA55C' },
    { id: 'Appearance', icon: <DarkModeIcon />, color: '#FAA61A' },
    { id: 'Notifications', icon: <NotificationsIcon />, color: '#ED4245' },
    { id: 'Language', icon: <LanguageIcon />, color: '#AD49E1' },
  ];

  const statusOptions = [
    { value: 'online', label: 'Online', icon: <CircleIcon sx={{ color: '#66BB6A' }} /> },
    { value: 'busy', label: 'Busy', icon: <DoNotDisturbOnIcon sx={{ color: '#f44336' }} /> },
    { value: 'away', label: 'Away', icon: <AccessTimeIcon sx={{ color: '#ffa726' }} /> },
    { value: 'offline', label: 'Offline', icon: <CircleIcon sx={{ color: '#747f8d' }} /> }
  ];

  useEffect(() => {
    // Update status to online, and set to offline on cleanup
    axios.put(`/api/status/${currentUser.uid}`, { status: 'online' })
      .catch(console.error);
    return () => {
      axios.put(`/api/status/${currentUser.uid}`, { status: 'offline' })
        .catch(console.error);
    };
  }, [currentUser.uid]);

  // Use currentUser prop directly for display (populated via AuthContext)
  useEffect(() => {
    if (currentUser) {
      // Force refresh from localStorage first to get the most recent data
      const storedUser = JSON.parse(localStorage.getItem('chatifyUser'));
      if (storedUser && storedUser.language) {
        // Always prioritize the language from localStorage when available
        setUserData({
          profileImageUrl: currentUser.profileImageUrl || '/default-avatar.png',
          username: currentUser.username || 'Anonymous User',
          language: storedUser.language || '',
          status: currentUser.status || 'offline',
        });
      } else {
        setUserData({
          profileImageUrl: currentUser.profileImageUrl || '/default-avatar.png',
          username: currentUser.username || 'Anonymous User',
          language: currentUser.language || '',
          status: currentUser.status || 'offline',
        });
      }
      setOldAvatarUrl(currentUser.profileImageUrl || '');
    }
  }, [currentUser]);

  // Set up WebSocket connection for real-time profile updates
  useEffect(() => {
    if (!currentUser?.uid) return;

    // Initialize STOMP client
    const socket = new SockJS('/ws');
    const client = new Client({
      webSocketFactory: () => socket,
      reconnectDelay: 5000,
      debug: function(str) {
        console.log('STOMP: ' + str);
      }
    });

    // Add reconnect event handlers
    client.onStompError = (frame) => {
      console.error('STOMP error:', frame);
      // Attempt to reconnect after error
      setTimeout(() => {
        if (!client.connected && client.active) {
          console.log('Attempting to reconnect after error...');
          client.activate();
        }
      }, 3000);
    };
    
    // On connection, subscribe to profile updates
    client.onConnect = () => {
      console.log('Connected to WebSocket');
      
      // On successful connection, refresh user data from localStorage
      const storedUser = JSON.parse(localStorage.getItem('chatifyUser'));
      if (storedUser && storedUser.language) {
        setUserData(prevData => ({
          ...prevData,
          language: storedUser.language
        }));
      }
      
      // Subscribe to user's specific updates
      client.subscribe(`/topic/users/${currentUser.uid}`, (message) => {
        const updatedUser = JSON.parse(message.body);
        console.log('Received profile update:', updatedUser);
        
        // Update local state with the new data (excluding avatar which needs special handling)
        setUserData(prevData => ({
          ...prevData,
          username: updatedUser.username || prevData.username,
          language: updatedUser.language || prevData.language,
          status: updatedUser.status || prevData.status,
        }));
        
        // Update the localStorage with the latest data
        const updatedStoredUser = {
          ...storedUser,
          username: updatedUser.username || storedUser.username,
          language: updatedUser.language || storedUser.language,
          status: updatedUser.status || storedUser.status,
        };
        localStorage.setItem('chatifyUser', JSON.stringify(updatedStoredUser));
      });
      
      // Subscribe to all user updates for cross-client sync
      client.subscribe('/topic/users', (message) => {
        const updatedUser = JSON.parse(message.body);
        
        // Only process if this is about another user updating your info
        if (updatedUser.id === currentUser.uid && updatedUser.id !== currentUser.id) {
          console.log('Received update from another client:', updatedUser);
          
          setUserData(prevData => ({
            ...prevData,
            username: updatedUser.username || prevData.username,
            language: updatedUser.language || prevData.language,
            status: updatedUser.status || prevData.status,
          }));
        }
      });
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
  }, [currentUser?.uid, currentUser?.id]);

  // Add these utility functions at the beginning of the component
  const truncateText = (text, maxLength) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
  };

  const truncatedUsername = truncateText(userData.username, 20);
  const truncatedEmail = truncateText(currentUser.email, 25);

  // Handle avatar selection
  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAvatarFile(file);
      setOpenCropDialog(true); // Open the crop dialog after selecting an image
    }
  };

  // Handle crop complete
  const onCropComplete = (_, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  // Upload cropped image
  const handleCropUpload = async () => {
    const croppedImage = await getCroppedImg(avatarFile, croppedAreaPixels); // Crop the image
    uploadAvatar(croppedImage); // Upload the cropped image to Firebase
    setOpenCropDialog(false); // Close the dialog after cropping
  };

  // Upload the cropped image to Spring Boot backend with progress tracking
  const uploadAvatar = async (croppedImage) => {
    setUploading(true); // Start uploading

    try {
      // Create a form data object to send the image file
      const formData = new FormData();
      
      // Convert the cropped image blob to a file
      const imageFile = new File([croppedImage], avatarFile.name, { type: avatarFile.type });
      formData.append('file', imageFile);
      formData.append('userId', currentUser.uid);
      
      // Delete the old avatar if it exists
      if (oldAvatarUrl && oldAvatarUrl !== '/default-avatar.png') {
        await deleteOldAvatar(oldAvatarUrl);
      }
      
      // Upload the new avatar
      const response = await axios.post('/api/users/avatar', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        }
      });
      
      // Update the user data with the new avatar URL
      setUserData((prevData) => ({
        ...prevData,
        profileImageUrl: response.data.profileImageUrl,
      }));
      
      // Update the user in localStorage to persist the avatar URL
      // This is crucial for retaining the avatar after page refresh
      const profileImageUrl = response.data.profileImageUrl;
      await updateUserProfile({ profileImageUrl });

      // Also update local storage directly as a fallback
      const storedUser = JSON.parse(localStorage.getItem('chatifyUser'));
      if (storedUser) {
        storedUser.profileImageUrl = profileImageUrl;
        localStorage.setItem('chatifyUser', JSON.stringify(storedUser));
      }
      
    } catch (error) {
      console.error('Error uploading avatar:', error);
    } finally {
      setUploading(false); // Stop uploading
    }
  };

  // Delete the old avatar from the backend
  const deleteOldAvatar = async (oldAvatarUrl) => {
    try {
      // Skip deletion if the URL is the default avatar or doesn't contain a valid filename
      if (!oldAvatarUrl || oldAvatarUrl === '/default-avatar.png' || !oldAvatarUrl.includes('/avatars/')) {
        return;
      }
      
      // Extract the filename from the URL
      const filename = oldAvatarUrl.split('/').pop();
      
      // Only attempt to delete if we have a valid filename
      if (filename && filename !== 'none' && filename !== 'default-avatar.png') {
        // Check if filename contains valid characters (not just "none" or empty)
        if (filename.includes('_') || filename.includes('.')) {
          await axios.delete(`/api/users/avatar/${filename}`);
          console.log('Old avatar deleted successfully');
        }
      }
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log('Avatar file not found, may have been already deleted');
      } else {
        console.error('Error deleting old avatar:', error);
      }
    }
  };

  const handleLogout = async () => {
    try {
      // Set user status to offline using REST API
      await axios.put(`/api/status/${currentUser.uid}`, { status: 'offline' });
      
      // Reset theme to light mode if currently in dark mode
      if (darkMode) {
        toggleDarkMode();
      }
      
      // Call the parent handleLogout function
      await parentHandleLogout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleUsernameDoubleClick = () => {
    setEditingUsername(true);
    setNewUsername(userData.username);
  };

  const handleUsernameChange = async (e) => {
    // If called from an event, prevent default behavior
    if (e && e.preventDefault) {
      e.preventDefault();
    }
    
    if (newUsername.trim() !== '') {
      try {
        // First update local state immediately (optimistic update)
        setUserData((prevData) => ({ ...prevData, username: newUsername }));
        
        // Update localStorage directly first
        const storedUser = JSON.parse(localStorage.getItem('chatifyUser')) || {};
        storedUser.username = newUsername;
        localStorage.setItem('chatifyUser', JSON.stringify(storedUser));
        
        // Then try the API update in the background
        axios.put('/api/auth/profile', { 
          id: currentUser.id,
          username: newUsername,
          language: userData.language
        }).catch(error => {
          console.error('Error updating username via API:', error);
        });
        
        // Update auth context (without waiting for response)
        updateUserProfile({ 
          username: newUsername,
          language: userData.language 
        }).catch(error => {
          console.error('Error updating profile in context:', error);
        });
      } catch (error) {
        console.error('Error updating username:', error);
      }
    }
    setEditingUsername(false);
  };

  const handleLanguageDoubleClick = (event) => {
    setAnchorEl(event.currentTarget);
    setFilteredLanguages(languages); // Reset filtered languages when opening popover
  };

  const handleLanguageSelect = async (language, event) => {
    // Prevent any default behavior
    if (event && event.preventDefault) {
      event.preventDefault();
    }
    
    try {
      // First update local state immediately (optimistic update)
      setUserData((prevData) => ({ 
        ...prevData, 
        language: language.label 
      }));
      
      // Update localStorage directly first
      const storedUser = JSON.parse(localStorage.getItem('chatifyUser')) || {};
      storedUser.language = language.label;
      localStorage.setItem('chatifyUser', JSON.stringify(storedUser));
      
      // Close language selection popover
      setAnchorEl(null);
      
      // Then try the API update in the background
      axios.put('/api/auth/profile', { 
        id: currentUser.id,
        username: userData.username,
        language: language.label
      }).catch(error => {
        console.error('Error updating language via API:', error);
      });
      
      // Update auth context (without waiting for response)
      updateUserProfile({ 
        username: userData.username,
        language: language.label 
      }).catch(error => {
        console.error('Error updating profile in context:', error);
      });
      
      console.log('Language updated successfully:', language.label);
    } catch (error) {
      console.error('Error updating language:', error);
    }
  };

  const handleSearchChange = (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filtered = languages.filter(lang => 
      lang.label.toLowerCase().includes(searchTerm)
    );
    setFilteredLanguages(filtered);
    setSearchTerm(e.target.value);
  };

  const handlePopoverClose = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);

  const handleSettingsOpen = () => {
    setSettingsOpen(true);
  };

  const handleSettingsClose = () => {
    setSettingsOpen(false);
  };

  const handleStatusClick = (event) => {
    setStatusAnchorEl(event.currentTarget);
  };

  const handleStatusClose = () => {
    setStatusAnchorEl(null);
  };

  const handleStatusChange = async (newStatus) => {
    try {
      // Update status using REST API
      await axios.put(`/api/status/${currentUser.uid}`, { status: newStatus });
      
      // Update local state
      setUserData(prevData => ({ ...prevData, status: newStatus }));
      
      // Update localStorage to persist the status
      const storedUser = JSON.parse(localStorage.getItem('chatifyUser'));
      if (storedUser) {
        storedUser.status = newStatus;
        localStorage.setItem('chatifyUser', JSON.stringify(storedUser));
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
    handleStatusClose();
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
    <Box>
      {/* Progress Bar for uploading */}
      {uploading && (
        <Box sx={{ width: '100%', mb: 2 }}>
          <LinearProgress variant="determinate" value={uploadProgress} />
          <Typography variant="caption" sx={{ color: '#b9bbbe' }}>
            Uploading: {Math.round(uploadProgress)}%
          </Typography>
        </Box>
      )}

      <Box sx={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        p: 1.5,
        minHeight: isMobile ? '120px' : '80px',
        height: 'auto',
        borderRadius: '5px',
        background: theme.palette.mode === 'dark'
          ? 'linear-gradient(135deg, #522C5D 0%, #845162 100%)'
          : 'linear-gradient(135deg, #FFE1FF, #E4B1F0, #7E60BF)',
        color: theme.palette.mode === 'dark' ? '#fff' : '#000',
        borderTop: '1px solid rgba(255, 255, 255, 0.2)',
        backdropFilter: 'blur(10px)',
        gap: isMobile ? 2 : 0,
      }}>
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          width: isMobile ? '100%' : 'auto',
          marginBottom: isMobile ? 1 : 0,
          maxWidth: isMobile ? '100%' : 'calc(100% - 120px)',
          flexWrap: 'wrap',
        }}>
          <Box sx={{ position: 'relative', mr: 2 }}>
            <input
              accept="image/*"
              type="file"
              id="avatar-upload"
              style={{ display: 'none' }}
              onChange={handleAvatarChange}
            />
            <label htmlFor="avatar-upload">
              <Avatar 
                src={userData.profileImageUrl}
                sx={{ 
                  width: isMobile ? 32 : 40,
                  height: isMobile ? 32 : 40,
                  cursor: 'pointer',
                  border: '2px solid',
                  borderColor: theme.palette.mode === 'dark' ? '#7a49a5' : '#fff',
                }}
              />
            </label>
            <Box
              onClick={handleStatusClick}
              sx={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 12,
                height: 12,
                backgroundColor: 'transparent',
                borderRadius: '50%',
                border: '2px solid',
                borderColor: theme.palette.mode === 'dark' ? '#7a49a5' : '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                '&:hover': {
                  transform: 'scale(1.1)',
                },
                '& .MuiSvgIcon-root': {
                  width: '100%',
                  height: '100%',
                }
              }}
            >
              {getStatusIcon(userData.status)}
            </Box>
          </Box>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            {editingUsername ? (
              <form>
                <TextField
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  onBlur={(e) => handleUsernameChange(e)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault(); // Prevent form submission
                      handleUsernameChange(e);
                    }
                  }}
                  size="small"
                  autoFocus
                  sx={{
                    input: { 
                      color: theme.palette.mode === 'dark' ? '#fff' : '#000',
                      padding: '4px 8px',
                    },
                    maxWidth: '100%',
                    '& .MuiOutlinedInput-root': {
                      fontSize: isMobile ? '0.875rem' : '1rem',
                    }
                  }}
                />
                <Button 
                  type="button" 
                  onClick={handleUsernameChange} 
                  style={{ display: 'none' }}
                >
                  Save
                </Button>
              </form>
            ) : (
              <Typography
                variant={isMobile ? "body2" : "body1"}
                sx={{ 
                  fontWeight: '500', 
                  cursor: 'pointer',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: theme.palette.mode === 'dark' ? '#fff' : '#000',
                  fontSize: isMobile ? '0.875rem' : '1rem',
                }}
                onClick={handleUsernameDoubleClick}
                title={userData.username}
              >
                {truncatedUsername}
              </Typography>
            )}
            <Typography
              variant="caption"
              sx={{ 
                cursor: 'pointer',
                display: 'block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: theme.palette.mode === 'dark' ? '#b9bbbe' : '#4a4a4a',
                fontWeight: 500,
              }}
              onClick={handleLanguageDoubleClick}
              title={userData.language || currentUser.email}
            >
              {userData.language || truncatedEmail}
            </Typography>
          </Box>
        </Box>

        {/* Language Popover */}
        <Popover
          open={Boolean(anchorEl)}
          anchorEl={anchorEl}
          onClose={() => setAnchorEl(null)}
          anchorOrigin={{
            vertical: 'top',
            horizontal: 'center',
          }}
          transformOrigin={{
            vertical: 'bottom',
            horizontal: 'center',
          }}
          PaperProps={{
            sx: {
              background: theme.palette.mode === 'dark'
                ? 'linear-gradient(135deg, #29104A 0%, #522C5D 100%)'
                : 'background.paper',
              borderRadius: '8px',
              boxShadow: theme.palette.mode === 'dark'
                ? '0 4px 20px rgba(0, 0, 0, 0.5)'
                : '0 4px 20px rgba(0, 0, 0, 0.1)',
            }
          }}
        >
          <Box sx={{ p: 2, minWidth: 250 }}>
            <TextField 
              placeholder='Search language...' 
              variant='outlined' 
              size='small' 
              fullWidth 
              sx={{ 
                mb: 1,
                '& .MuiOutlinedInput-root': {
                  backgroundColor: theme.palette.mode === 'dark' 
                    ? 'rgba(82, 44, 93, 0.3)' 
                    : 'background.paper',
                  '& fieldset': {
                    borderColor: theme.palette.mode === 'dark' ? '#522C5D' : 'divider',
                  },
                  '&:hover fieldset': {
                    borderColor: theme.palette.mode === 'dark' ? '#845162' : 'primary.main',
                  },
                },
                '& .MuiInputBase-input': {
                  color: theme.palette.mode === 'dark' ? '#E3B8B1' : 'text.primary',
                },
              }}
              value={searchTerm} 
              onChange={handleSearchChange}
            />
            <List sx={{ 
              maxHeight: 200, 
              overflow: 'auto',
              border: '1px solid',
              borderColor: theme.palette.mode === 'dark' ? '#522C5D' : 'divider',
              borderRadius: '4px',
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
              '&::-webkit-scrollbar-thumb:hover': {
                background: theme.palette.mode === 'dark'
                  ? 'linear-gradient(180deg, #8967B3 0%, #E3B8B1 100%)'
                  : '#555',
              },
              scrollbarWidth: 'thin',
              scrollbarColor: theme.palette.mode === 'dark'
                ? '#845162 #29104A'
                : '#888 #f1f1f1',
            }}>
              {filteredLanguages.map((language) => (
                <ListItem key={language.label} disablePadding>
                  <ListItemButton 
                    onClick={(event) => {
                      // Explicitly stop propagation and prevent default
                      event.stopPropagation();
                      event.preventDefault();
                      handleLanguageSelect(language, event);
                    }}
                    sx={{
                      color: theme.palette.mode === 'dark' ? '#E3B8B1' : 'text.primary',
                      '&:hover': {
                        backgroundColor: theme.palette.mode === 'dark' 
                          ? 'rgba(173, 73, 225, 0.08)'
                          : 'rgba(0, 0, 0, 0.04)',
                      },
                    }}
                  >
                    {language.label}
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Box>
        </Popover>

        {/* Crop Dialog */}
        <Dialog
          open={openCropDialog}
          onClose={() => setOpenCropDialog(false)}
          maxWidth="md" // Set a larger width for the dialog
          fullWidth={true} // Make it use the full available width
        >
          <DialogContent
            sx={{
              position: 'relative',
              width: '100%',
              height: '400px', // Adjust height for larger crop area
              backgroundColor: '#333', // Dark background for contrast
            }}
          >
            <Cropper
              image={avatarFile ? URL.createObjectURL(avatarFile) : null}
              crop={crop}
              zoom={zoom}
              aspect={1} // 1:1 aspect ratio for avatar
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              style={{
                containerStyle: {
                  width: '100%',
                  height: '100%',
                },
              }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenCropDialog(false)} color="secondary">
              Cancel
            </Button>
            <Button onClick={handleCropUpload} color="primary">
              Save
            </Button>
          </DialogActions>
        </Dialog>

        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center',
          width: isMobile ? '100%' : 'auto',
          justifyContent: isMobile ? 'center' : 'flex-start',
          marginTop: isMobile ? 1 : 0,
          flexShrink: 0,
          gap: 1,
        }}>
          <IconButton 
            sx={{ 
              color: theme.palette.mode === 'dark' ? '#b9bbbe' : '#4a4a4a',
              '&:hover': {
                color: theme.palette.mode === 'dark' ? '#fff' : '#000',
              },
            }} 
            onClick={toggleDarkMode}
          >
            {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>
          <IconButton 
            sx={{ 
              color: theme.palette.mode === 'dark' ? '#b9bbbe' : '#4a4a4a',
              '&:hover': {
                color: theme.palette.mode === 'dark' ? '#fff' : '#000',
              },
            }} 
            onClick={handleLogout}
          >
            <LogoutIcon />
          </IconButton>
          <IconButton 
            sx={{ 
              color: theme.palette.mode === 'dark' ? '#b9bbbe' : '#4a4a4a',
              '&:hover': {
                color: theme.palette.mode === 'dark' ? '#fff' : '#000',
              },
            }} 
            onClick={handleSettingsOpen}
          >
            <SettingsIcon />
          </IconButton>
        </Box>
      </Box>

      {/* Settings Dialog */}
      <UserSettings 
        open={settingsOpen}
        onClose={handleSettingsClose}
        currentUser={currentUser}
        userData={userData}
        editingUsername={editingUsername}
        newUsername={newUsername}
        setNewUsername={setNewUsername}
        handleUsernameDoubleClick={handleUsernameDoubleClick}
        languages={languages}
        handleLanguageSelect={handleLanguageSelect}
        darkMode={darkMode}
        toggleDarkMode={toggleDarkMode}
        selectedSetting={selectedSetting}
        setSelectedSetting={setSelectedSetting}
        handleAvatarChange={handleAvatarChange}
      />

      {/* Status Menu */}
      <Menu
        anchorEl={statusAnchorEl}
        open={Boolean(statusAnchorEl)}
        onClose={handleStatusClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'center',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'center',
        }}
      >
        {statusOptions.map((option) => (
          <MenuItem
            key={option.value}
            onClick={() => handleStatusChange(option.value)}
            selected={userData.status === option.value}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              minWidth: 150,
              '& .MuiSvgIcon-root': {
                color: getStatusColor(option.value),
                ...(option.value === 'busy' && {
                  backgroundColor: '#f44336',
                  borderRadius: '50%',
                  '& path:first-of-type': {
                    fill: 'white',
                  }
                }),
                ...(option.value === 'away' && {
                  backgroundColor: '#ffa726',
                  borderRadius: '50%',
                  '& path': {
                    fill: 'white',
                  }
                }),
              },
            }}
          >
            {option.icon}
            <Typography>{option.label}</Typography>
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
};

export default UserProfile;