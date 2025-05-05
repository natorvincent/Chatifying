import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    const userJson = localStorage.getItem('chatifyUser');
    return userJson ? JSON.parse(userJson) : null;
  });
  const [loading, setLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  
  // Ensure language preference is correctly loaded on page refresh
  useEffect(() => {
    // This effect specifically handles page refreshes and ensures persisted preferences are loaded
    if (currentUser) {
      const storedUserJson = localStorage.getItem('chatifyUser');
      if (storedUserJson) {
        const storedUser = JSON.parse(storedUserJson);
        
        // Check if there are any differences between currentUser and localStorage
        if (storedUser.language !== currentUser.language) {
          console.log('Refreshing language preference from localStorage:', storedUser.language);
          setCurrentUser(prevUser => ({
            ...prevUser,
            language: storedUser.language
          }));
        }
      }
    }
  }, []);  // Empty dependency array means this runs once on mount, perfect for page refresh
  
  // Setup axios interceptor for authentication
  useEffect(() => {
    const interceptor = axios.interceptors.request.use(
      config => {
        if (currentUser?.token) {
          config.headers.Authorization = `Bearer ${currentUser.token}`;
        }
        return config;
      },
      error => Promise.reject(error)
    );
    
    // Set default authorization header if user exists
    if (currentUser?.token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${currentUser.token}`;
    }
    
    return () => axios.interceptors.request.eject(interceptor);
  }, [currentUser]);

  async function registerUser(email, password) {
    setIsRegistering(true);
    try {
      await axios.post(`${import.meta.env.BACKEND_URL}/api/auth/register`, { email, password });
    } finally {
      setIsRegistering(false);
    }
  }

  async function login(email, password) {
    setLoading(true);
    try {
      // Get the backend URL with the same function used in ChatArea
      const backendUrl = process.env.NODE_ENV === 'production'
        ? 'https://chatifying.onrender.com'
        : 'http://localhost:8080';
        
      const response = await axios.post(`${backendUrl}/api/auth/login`, { email, password });
      // Map backend user id to uid for compatibility with existing ChatPage logic
      const user = { ...response.data, uid: response.data.id };
      
      // Store token for future requests
      axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
      
      setCurrentUser(user);
      // Persist user session in localStorage
      localStorage.setItem('chatifyUser', JSON.stringify(user));
      return user;
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    // Clear authorization header
    delete axios.defaults.headers.common['Authorization'];
    
    setCurrentUser(null);
    // Clear persisted session
    localStorage.removeItem('chatifyUser');
  }

  async function updateUserProfile(userData) {
    setLoading(true);
    
    try {
      // Create a local update first - for all cases
      const updatedUser = {
        ...currentUser,
        ...(userData.username && { username: userData.username }),
        ...(userData.language && { language: userData.language }),
        ...(userData.profileImageUrl && { profileImageUrl: userData.profileImageUrl })
      };
      
      // Update local state immediately
      setCurrentUser(updatedUser);
      
      // Update localStorage immediately
      localStorage.setItem('chatifyUser', JSON.stringify(updatedUser));
      
      // If we only have profileImageUrl, we're done (no need for API call)
      if (userData.profileImageUrl && !userData.username && !userData.language) {
        return updatedUser;
      }
      
      // Make the API call in the background, don't await it
      const payload = { 
        id: currentUser?.id, 
        ...(userData.username && { username: userData.username }),
        ...(userData.language && { language: userData.language }),
        ...(userData.profileImageUrl && { profileImageUrl: userData.profileImageUrl })
      };
      
      // Fire and forget API call (handled via catch)
      axios.put(`${import.meta.env.BACKEND_URL}/api/auth/profile`, payload)
        .then(response => {
          // If successful, update with the server response
          const serverUser = { ...response.data, uid: response.data.id };
          setCurrentUser(serverUser);
          localStorage.setItem('chatifyUser', JSON.stringify(serverUser));
          console.log('Profile updated on server successfully');
        })
        .catch(error => {
          console.error('API update failed, but local changes were saved:', error);
        });
      
      // Return the locally updated user immediately
      return updatedUser;
    } catch (error) {
      console.error('Failed to update profile locally:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }

  const value = {
    currentUser,
    registerUser,
    login,
    logout,
    loading,
    updateUserProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}