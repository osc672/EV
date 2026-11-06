import axios from 'axios';

export const API_BASE = 'http://localhost:4000/api/v1';

export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('evrescue_admin_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !window.location.pathname.includes('/login')) {
      localStorage.removeItem('evrescue_admin_token');
      localStorage.removeItem('evrescue_admin_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

