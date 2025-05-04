import React, { useState } from 'react';
import { Box, Popover, IconButton, Typography, Grid, Tooltip, Badge } from '@mui/material';
import { EmojiEmotions as EmojiIcon } from '@mui/icons-material';
import axios from 'axios';

export const MessageReactions = ({ 
  messageReactions, 
  messageId, 
  currentUser, 
  chatUser, 
  groupId,
  isCurrentUserMessage,
  reactionAnchorEl, 
  selectedMessageForReaction,
  onCloseReactionMenu,
  onReactionClick 
}) => {
  // Emoji options for the reaction picker
  const emojiOptions = ['👍', '❤️', '😂', '😮', '😢', '👏', '🔥', '🎉'];
  
  // Use passed message reactions directly instead of local state
  // This ensures the component always shows the latest reactions from the parent
  
  // Controls the open/close state of the emoji picker
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);
  
  // Group reactions by emoji for displaying counts
  const groupedReactions = messageReactions.reduce((acc, reaction) => {
    if (!acc[reaction.emoji]) {
      acc[reaction.emoji] = [];
    }
    acc[reaction.emoji].push(reaction);
    return acc;
  }, {});

  const handleAddReaction = (emoji) => {
    console.log(`Adding reaction ${emoji} to message ${messageId}`);
    
    axios.post(`/api/reactions`, {
      messageId: messageId,
      chatId: groupId, // Use the groupId prop 
      emoji: emoji,
      userId: currentUser.uid,
      username: currentUser.displayName || currentUser.email
    })
    .then(() => {
      // Reaction added - UI will be updated via WebSocket
      setAnchorEl(null);
    })
    .catch(error => {
      console.error('Error adding reaction:', error);
      setAnchorEl(null);
    });
  };

  const handleRemoveReaction = (emoji) => {
    console.log(`Removing reaction ${emoji} from message ${messageId}`);
    
    // Find if current user has this reaction
    const userReaction = messageReactions.find(r => 
      r.emoji === emoji && r.userId === currentUser.uid
    );
    
    if (userReaction) {
      axios.delete(`/api/reactions/${userReaction.reactionId}`)
      .then(() => {
        // Reaction removed - UI will be updated via WebSocket
      })
      .catch(error => {
        console.error('Error removing reaction:', error);
      });
    }
  };

  const handleOpenEmojiPicker = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleCloseEmojiPicker = () => {
    setAnchorEl(null);
  };

  const handleEmojiClick = (emoji) => {
    // Check if user already has this reaction
    const hasReaction = messageReactions.some(
      reaction => reaction.emoji === emoji && reaction.userId === currentUser.uid
    );
    
    if (hasReaction) {
      handleRemoveReaction(emoji);
    } else {
      handleAddReaction(emoji);
    }
    
    handleCloseEmojiPicker();
  };

  // Check if the current message is the one selected for the reaction popover
  const isSelectedMessage = selectedMessageForReaction && selectedMessageForReaction.messageId === messageId;
  
  // Only render the reaction popover for the selected message
  const reactionPopoverOpen = Boolean(reactionAnchorEl) && isSelectedMessage;

  return (
    <>
      {/* Reaction buttons display */}
      {Object.keys(groupedReactions).length > 0 && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 0,
            left: isCurrentUserMessage ? 'auto' : 10, 
            right: isCurrentUserMessage ? 10 : 'auto',
            transform: 'translateY(50%)',
            display: 'flex',
            gap: 0.5,
            bgcolor: 'background.paper',
            borderRadius: 10,
            boxShadow: 1,
            p: 0.5,
            zIndex: 1
          }}
        >
          {Object.entries(groupedReactions).map(([emoji, reactions]) => {
            const hasUserReaction = reactions.some(r => r.userId === currentUser.uid);
            
            return (
              <Badge
                key={emoji}
                badgeContent={reactions.length}
                color="primary"
                overlap="circular"
                sx={{
                  '& .MuiBadge-badge': {
                    fontSize: '0.6rem',
                    height: '18px',
                    minWidth: '18px',
                  },
                }}
              >
                <Tooltip
                  title={reactions.map(r => r.username).join(', ')}
                  arrow
                  placement="top"
                >
                  <IconButton
                    size="small"
                    onClick={() => handleEmojiClick(emoji)}
                    sx={{
                      backgroundColor: hasUserReaction ? 'action.selected' : 'transparent',
                      p: 0.5,
                      minWidth: 30,
                      fontSize: '0.875rem',
                      borderRadius: '10px',
                      '&:hover': {
                        backgroundColor: 'action.hover',
                      },
                    }}
                  >
                    {emoji}
                  </IconButton>
                </Tooltip>
              </Badge>
            );
          })}
        </Box>
      )}

      {/* Add reaction button - hidden but used for the button click handler */}
      <IconButton
        size="small"
        onClick={(e) => onReactionClick(messageId)}
        sx={{ visibility: 'hidden', position: 'absolute' }}
      >
        <EmojiIcon fontSize="small" />
      </IconButton>

      {/* Emoji picker */}
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleCloseEmojiPicker}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'center',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'center',
        }}
      >
        <Box sx={{ p: 1 }}>
          <Grid container spacing={1} sx={{ maxWidth: 220 }}>
            {emojiOptions.map((emoji) => (
              <Grid item key={emoji}>
                <IconButton onClick={() => handleEmojiClick(emoji)}>
                  <Typography>{emoji}</Typography>
                </IconButton>
              </Grid>
            ))}
          </Grid>
        </Box>
      </Popover>

      {/* Reaction menu from message context menu */}
      <Popover
        id={`reaction-popover-${messageId}`}
        open={reactionPopoverOpen}
        anchorEl={reactionAnchorEl}
        onClose={onCloseReactionMenu}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'center',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'center',
        }}
      >
        <Box sx={{ p: 1 }}>
          <Grid container spacing={1} sx={{ maxWidth: 220 }}>
            {emojiOptions.map((emoji) => (
              <Grid item key={emoji}>
                <IconButton onClick={() => handleEmojiClick(emoji)}>
                  <Typography>{emoji}</Typography>
                </IconButton>
              </Grid>
            ))}
          </Grid>
        </Box>
      </Popover>
    </>
  );
};

export default MessageReactions; 