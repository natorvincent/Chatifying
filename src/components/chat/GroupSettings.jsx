import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemSecondaryAction,
  Avatar,
  IconButton,
  Button,
  TextField,
  Box,
  Typography,
  Menu,
  MenuItem,
  useTheme,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import axios from 'axios';

const GroupSettings = ({ open, onClose, groupChat, currentUser, members }) => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [groupName, setGroupName] = useState(groupChat?.name || '');
  const [isEditing, setIsEditing] = useState(false);

  const isAdmin = groupChat?.members[currentUser.uid]?.role === 'admin';

  const handleMenuOpen = (event, member) => {
    setAnchorEl(event.currentTarget);
    setSelectedMember(member);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedMember(null);
  };

  const handleMakeAdmin = async () => {
    if (!selectedMember) return;
    await axios.patch(`/api/group-members/${groupChat.id}/${selectedMember.userId}`, { role: 'admin' });
    handleMenuClose();
  };

  const handleRemoveMember = async () => {
    if (!selectedMember) return;
    try {
      await axios.delete(`/api/group-members/${groupChat.id}/${selectedMember.userId}`);
      handleMenuClose();
    } catch (error) {
      console.error('Error removing member:', error);
    }
  };

  const handleUpdateGroupName = async () => {
    if (groupName.trim() && groupName !== groupChat.name) {
      await axios.patch(`/api/groups/${groupChat.id}`, { name: groupName.trim() });
    }
    setIsEditing(false);
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          background: theme.palette.mode === 'dark'
            ? 'linear-gradient(135deg, #29104A 0%, #522C5D 100%)'
            : 'background.paper',
        }
      }}
    >
      <DialogTitle>Group Settings</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 3 }}>
          {isEditing ? (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                fullWidth
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                size="small"
              />
              <Button onClick={handleUpdateGroupName}>Save</Button>
              <Button onClick={() => setIsEditing(false)}>Cancel</Button>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6">{groupChat.name}</Typography>
              {isAdmin && (
                <Button onClick={() => setIsEditing(true)}>Edit Name</Button>
              )}
            </Box>
          )}
        </Box>

        <Typography variant="subtitle1" sx={{ mb: 2 }}>Members ({Object.keys(members).length})</Typography>
        <List>
          {Object.values(members).map((member) => (
            <ListItem key={member.userId}>
              <ListItemAvatar>
                <Avatar src={member.profileImageUrl} />
              </ListItemAvatar>
              <ListItemText
                primary={member.username}
                secondary={`${member.role} • ${member.language || 'No language set'}`}
              />
              {isAdmin && member.userId !== currentUser.uid && (
                <ListItemSecondaryAction>
                  <IconButton onClick={(e) => handleMenuOpen(e, member)}>
                    <MoreVertIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              )}
            </ListItem>
          ))}
        </List>

        {isAdmin && (
          <Button
            startIcon={<PersonAddIcon />}
            fullWidth
            variant="outlined"
            sx={{ mt: 2 }}
          >
            Add Members
          </Button>
        )}

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
        >
          <MenuItem onClick={handleMakeAdmin}>
            Make Admin
          </MenuItem>
          <MenuItem onClick={handleRemoveMember} sx={{ color: 'error.main' }}>
            Remove from Group
          </MenuItem>
        </Menu>
      </DialogContent>
    </Dialog>
  );
};

export default GroupSettings; 