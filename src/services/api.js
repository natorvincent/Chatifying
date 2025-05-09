import axios from 'axios';

// Function to get the backend URL based on environment
export const getBackendUrl = () => {
  if (process.env.NODE_ENV === 'production') {
    return 'https://chatifying.onrender.com';
  } else {
    return 'http://localhost:8080';
  }
};

// Create an axios instance with the base URL
const api = axios.create({
  baseURL: getBackendUrl(),
});

export default api;