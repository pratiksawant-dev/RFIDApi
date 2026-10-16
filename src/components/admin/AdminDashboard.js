import React, { useEffect, useState } from 'react';
import AdminHeader from './AdminHeader';
import AdminHome from './AdminHome';
import AdminRegister from './AdminRegister';
import AdminUploadRFID from './AdminUploadRFID';
import AdminUsers from './AdminUsers';
import UserBackupPage from './UserBackupPage';
import AdminUserActivity from './AdminUserActivity';
import AdminUserPlans from './AdminUserPlans';
import AdminRequestDemo from './AdminRequestDemo';
import AdminUserContactList from './AdminUserContactList';
import NetworkErrorState from '../common/NetworkErrorState';

const AdminDashboard = () => {
  const [activeSection, setActiveSection] = useState('home');
  const [users, setUsers] = useState([]);
  const [erpUsers, setErpUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch all users (RFID Third Party Users)
  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch('https://rrgold.loyalstring.co.in/api/Admin/GetAllUsers', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) throw new Error('Failed to fetch users');
      const data = await response.json();
      setUsers(data);
    } catch (err) {
      setError(err.message || 'Error fetching users');
    } finally {
      setLoading(false);
    }
  };

  // Fetch Sparkle ERP users (Client Onboarding records)
  const fetchErpUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch('https://rrgold.loyalstring.co.in/api/Admin/GetAllSparkleClientOnboarding', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) throw new Error('Failed to fetch Sparkle ERP user records');
      const data = await response.json();
      setErpUsers(data);
    } catch (err) {
      setError(err.message || 'Error fetching Sparkle ERP user records');
    } finally {
      setLoading(false);
    }
  };

  // Initial data fetch
  useEffect(() => {
    fetchUsers();
    fetchErpUsers();
  }, []);

  // Handle navigation
  const handleNavigation = (section) => {
    console.log('handleNavigation called with section:', section); // Debug log
    setActiveSection(section);
    setError('');
  };

  // Handle successful registration
  const handleRegistrationSuccess = () => {
    fetchUsers();
    fetchErpUsers();
  };

  // Handle view details for users
  const handleViewDetails = async (clientCode, userType) => {
    try {
      const token = localStorage.getItem('adminToken');
      let endpoint = '';
      
      if (userType === 'rfid') {
        endpoint = `https://rrgold.loyalstring.co.in/api/Admin/GetUserByClientCode/${clientCode}`;
      } else if (userType === 'erp') {
        endpoint = `https://rrgold.loyalstring.co.in/api/Admin/GetSparkleUserByClientCode/${clientCode}`;
      }
      
      const response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) throw new Error('Failed to fetch user details');
      const userDetails = await response.json();
      
      // You can handle the user details here - show in modal, navigate to detail page, etc.
      console.log('User details:', userDetails);
      alert(`User Details:\n${JSON.stringify(userDetails, null, 2)}`);
      
    } catch (err) {
      console.error('Error fetching user details:', err);
      alert('Error fetching user details: ' + err.message);
    }
  };

  // Render current section
  const renderCurrentSection = () => {
    console.log('Current active section:', activeSection); // Debug log
    switch (activeSection) {
      case 'home':
        return (
          <AdminHome 
            users={users} 
            erpUsers={erpUsers}
            loading={loading}
            error={error}
          />
        );
      case 'register':
        return (
          <AdminRegister 
            onSuccess={handleRegistrationSuccess}
          />
        );
      case 'upload':
        return <AdminUploadRFID />;
      case 'rfid-users':
        console.log('Rendering RFID Users with data:', users.length, 'users'); // Debug log
        return (
          <AdminUsers 
            userType="rfid"
            users={users}
            erpUsers={erpUsers}
            loading={loading}
            error={error}
            onViewDetails={handleViewDetails}
          />
        );
      case 'erp-users':
        console.log('Rendering ERP Users with data:', erpUsers.length, 'users'); // Debug log
        return (
          <AdminUsers 
            userType="erp"
            users={users}
            erpUsers={erpUsers}
            loading={loading}
            error={error}
            onViewDetails={handleViewDetails}
          />
        );
      case 'user-backup':
        console.log('Rendering User Backup Page'); // Debug log
        return <UserBackupPage />;
      case 'activities':
        return <AdminUserActivity />;
      case 'request-demo':
        return <AdminRequestDemo />;
      case 'user-contact-list':
        return <AdminUserContactList />;
      case 'user-activity':
        return <AdminUserActivity />;
      case 'user-plans':
        return <AdminUserPlans />;
      default:
        console.log('Default case - rendering home'); // Debug log
        return (
          <AdminHome 
            users={users} 
            erpUsers={erpUsers}
            loading={loading}
            error={error}
          />
        );
    }
  };

  return (
    <div style={{ 
      width: '100%',
      minHeight: '100vh',
      background: '#f8faff', 
      fontFamily: 'var(--font-family)',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflowX: 'hidden'
    }} className="app-ui-shell">
      <AdminHeader 
        activeSection={activeSection}
        onNavigate={handleNavigation}
      />
      
      <main style={{ 
        flex: 1,
        width: '100%',
        position: 'relative',
        zIndex: 1,
        background: '#f8faff',
        minHeight: 'calc(100vh - 72px)',
        display: 'block',
        overflowY: 'auto'
      }}>
        {error && (
          <div style={{ margin: '16px' }}>
            <NetworkErrorState error={error} onRetry={fetchUsers} variant="inline" />
          </div>
        )}
        {renderCurrentSection()}
      </main>
    </div>
  );
};

export default AdminDashboard; 