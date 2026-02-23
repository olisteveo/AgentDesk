import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface TopNavProps {
  onNewTask: () => void;
  onMeetingRoom: () => void;
  onSetup: () => void;
  onTogglePause: () => void;
  onReset: () => void;
  onAccountSettings: () => void;
  isPaused: boolean;
}

export const TopNav: React.FC<TopNavProps> = ({
  onNewTask,
  onMeetingRoom,
  onSetup,
  onTogglePause,
  onReset,
  onAccountSettings,
  isPaused,
}) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Even if the API call fails, context clears tokens
    }
    navigate('/login');
  };

  return (
    <div className="top-nav">
      <button onClick={onNewTask}>New Task</button>
      <button onClick={onMeetingRoom}>Meeting Room</button>
      <button onClick={onSetup}>Setup</button>
      <button onClick={onTogglePause}>{isPaused ? 'Resume' : 'Pause'}</button>
      <button onClick={onReset}>Reset</button>

      {user && (
        <span className="top-nav-user-name" title={user.email}>
          {user.displayName}
        </span>
      )}

      <div
        className="user-icon"
        onClick={onAccountSettings}
        title="Account Settings"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </div>

      <button className="top-nav-logout" onClick={handleLogout} title="Logout">
        Logout
      </button>
    </div>
  );
};
