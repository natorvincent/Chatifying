import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Box } from '@mui/material';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { LanguageProvider } from './contexts/Languages.jsx';
import Login from './components/login-register/Login';
import ChatPage from './components/chat/ChatPage';
import Register from './components/login-register/Register';
import ForgotPassword from './components/login-register/ForgotPassword';
import ProfileSetup from './components/login-register/ProfileSetup';
import LandingPage from './components/landing/LandingPage';
import chatifyLogo from './assets/chatifylogo.png';

// LoadingSpinner component - displays the Chatify logo while content is loading
const LoadingSpinner = React.memo(() => (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    <img src={chatifyLogo} alt="Chatify Logo" style={{ width: '250px', height: 'auto' }} />
  </Box>
));

// AuthWrapper component - handles initial authentication state
const AuthWrapper = React.memo(({ children }) => {
  const { loading } = useAuth();
  if (loading) {
    return <LoadingSpinner />;
  }
  return children;
});

// ProtectedRoute component - ensures users are authenticated and have a complete profile
const ProtectedRoute = React.memo(({ children }) => {
  const { currentUser } = useAuth();
  if (!currentUser) {
    return <Navigate to="/login" />;
  }
  const profileComplete =
    currentUser.language &&
    currentUser.username &&
    currentUser.username !== currentUser.email;
  if (!profileComplete) {
    return <Navigate to="/profile-setup" />;
  }
  return children;
});

// AppRoutes component - defines all application routes and their corresponding components
const AppRoutes = React.memo(() => {
  const { currentUser, logout } = useAuth();

  // Define routes with their paths and components
  // Uses useMemo to prevent unnecessary re-renders
  const routes = useMemo(() => [
    // Landing page - accessible to all users
    { path: "/", element: <LandingPage /> },
    // Login/Register routes - redirect to chat if user is already logged in
    { path: "/login", element: currentUser ? <Navigate to="/chat" /> : <Login /> },
    { path: "/register", element: currentUser ? <Navigate to="/chat" /> : <Register /> },
    // Chat route - protected, requires authentication and complete profile
    { 
      path: "/chat", 
      element: (
        <ProtectedRoute>
          <ChatPage currentUser={currentUser} handleLogout={logout} />
        </ProtectedRoute>
      )
    },
    // Password recovery route
    { path: "/forgot-password", element: currentUser ? <Navigate to="/chat" /> : <ForgotPassword /> },
    // Profile setup route - only accessible to logged-in users
    { 
      path: "/profile-setup", 
      element: currentUser ? <ProfileSetup /> : <Navigate to="/login" />
    },
  ], [currentUser, logout]);

  return (
    <Routes>
      {routes.map((route) => (
        <Route key={route.path} path={route.path} element={route.element} />
      ))}
    </Routes>
  );
});

// Main App component - sets up providers and router
const App = () => {
  return (
    <AuthProvider>      {/* Provides authentication context */}
      <LanguageProvider>{/* Provides language/localization context */}
        <Router>        {/* Sets up routing */}
          <AuthWrapper> {/* Handles auth state and loading */}
            <AppRoutes />{/* Renders routes based on current auth state */}
          </AuthWrapper>
        </Router>
      </LanguageProvider>
    </AuthProvider>
  );
};

export default App;
