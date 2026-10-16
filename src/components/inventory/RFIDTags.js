import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { FaSearch, FaFileExcel, FaTrash, FaFilePdf, FaEnvelope, FaTimes, FaEdit, FaCheck } from 'react-icons/fa';
import { BiTag } from 'react-icons/bi';
import { HiOutlineArrowUpTray } from 'react-icons/hi2';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useNotifications } from '../../context/NotificationContext';
import { useLoading } from '../../App';
import NetworkErrorState from '../common/NetworkErrorState';

const ITEMS_PER_PAGE = 15;

const RFIDTags = () => {
  const { setLoading } = useLoading();
  const [rfidData, setRfidData] = useState([]);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [editingRows, setEditingRows] = useState(new Set());
  const [editedValues, setEditedValues] = useState({});
  const [pageInput, setPageInput] = useState('');
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const { addNotification } = useNotifications();

  // Get client code from localStorage
  const getClientCode = () => {
    const userInfo = localStorage.getItem('userInfo');
    if (userInfo) {
      try {
        return JSON.parse(userInfo).ClientCode;
      } catch (err) {
        console.error('Error parsing userInfo:', err);
        return null;
      }
    }
    return null;
  };

  // Fetch RFID data
  const fetchRFIDData = async () => {
    try {
      setLoading(true);
      const clientCode = getClientCode();
      
      if (!clientCode) {
        throw new Error('Client code not found. Please login again.');
      }

      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllRFID',
        { ClientCode: clientCode }
      );

      if (response.data && Array.isArray(response.data)) {
        setRfidData(response.data);
      } else {
        throw new Error('Invalid data format received');
      }
    } catch (err) {
      console.error('Error fetching RFID data:', err);
      setError(err.message || 'Failed to fetch RFID data');
      toast.error(err.message || 'Failed to fetch RFID data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRFIDData();
    
    // Handle window resize for responsive design
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Filter data based on search query
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) {
      return rfidData;
    }
    const searchLower = searchQuery.toLowerCase();
    return rfidData.filter(item => {
      return (
        item.BarcodeNumber?.toLowerCase().includes(searchLower) ||
        item.TidValue?.toLowerCase().includes(searchLower) ||
        item.EPCValue?.toLowerCase().includes(searchLower)
      );
    });
  }, [rfidData, searchQuery]);

  // Calculate total pages and records
  const totalPages = Math.max(1, Math.ceil(filteredData.length / ITEMS_PER_PAGE));
  const totalRecords = filteredData.length;

  // Get paginated data
  const currentTableData = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredData.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredData, currentPage]);

  const paddedTableSlots = useMemo(() => {
    const slots = currentTableData.map((item) => ({ kind: 'row', item }));
    const padCount = Math.max(0, ITEMS_PER_PAGE - slots.length);
    for (let i = 0; i < padCount; i += 1) {
      slots.push({ kind: 'pad', key: `rfid-tags-pad-${currentPage}-${i}` });
    }
    return slots;
  }, [currentTableData, currentPage]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Handle direct page navigation
  const handlePageInputChange = (e) => {
    const value = e.target.value;
    // Only allow numbers
    if (value === '' || /^\d+$/.test(value)) {
      setPageInput(value);
    }
  };

  const handlePageInputSubmit = (e) => {
    if (e.key === 'Enter' || e.type === 'click') {
      const pageNum = parseInt(pageInput);
      if (pageNum >= 1 && pageNum <= totalPages) {
        setCurrentPage(pageNum);
        setPageInput('');
      } else {
        toast.error(`Please enter a page number between 1 and ${totalPages}`);
        setPageInput('');
      }
    }
  };


  // Handle checkbox selection
  const handleSelectTag = (id) => {
    setSelectedTags(prev => {
      if (prev.includes(id)) {
        return prev.filter(tagId => tagId !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  // Handle select all
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedTags(prev => [...new Set([...prev, ...currentTableData.map(item => item.Id)])]);
    } else {
      setSelectedTags(prev => prev.filter(id => !currentTableData.find(item => item.Id === id)));
    }
  };

  // Handle export options
  const handleExportExcel = () => {
    toast.success('Exporting to Excel...');
    setShowExportModal(false);
    const userInfo = JSON.parse(localStorage.getItem('userInfo'));
    addNotification({
      title: 'Export successful',
      description: `RFID tags exported to Excel by ${userInfo?.Username || userInfo?.UserName || 'User'}`,
      type: 'info'
    });
  };

  const handleExportPDF = () => {
    if (!rfidData || rfidData.length === 0) {
      toast.error('No data available to export');
      return;
    }
    try {
      const userInfo = JSON.parse(localStorage.getItem('userInfo'));
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('RFID Tags Report', 14, 16);
      doc.setFontSize(10);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 24);
      const tableColumn = ['Sr No', 'RFID Code', 'EPC Value'];
      const tableRows = rfidData.map((item, idx) => [
        idx + 1,
        item.BarcodeNumber || '-',
        item.TidValue || '-'
      ]);
      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 30,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [69, 73, 232], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 247, 250] }
      });
      doc.save('RFID_Tags_Report.pdf');
      setShowExportModal(false);
      toast.success('PDF file downloaded successfully!');
      addNotification({
        title: 'Export successful',
        description: `RFID tags exported to PDF by ${userInfo?.Username || userInfo?.UserName || 'User'}`,
        type: 'info'
      });
    } catch (err) {
      console.error('Export to PDF failed:', err);
      toast.error('Failed to export PDF file');
    }
  };

  const handleEmailExport = () => {
    if (!emailInput) {
      toast.error('Please enter an email address');
      return;
    }
    const userInfo = JSON.parse(localStorage.getItem('userInfo'));
    toast.success(`Sending export to ${emailInput}...`);
    setEmailInput('');
    setShowExportModal(false);
    addNotification({
      title: 'Export successful',
      description: `RFID tags exported to email: ${emailInput} by ${userInfo?.Username || userInfo?.UserName || 'User'}`,
      type: 'info'
    });
  };

  // Handle delete confirmation
  const handleDelete = () => {
    if (selectedTags.length === 0) {
      toast.warning('Please select tags to delete');
      return;
    }
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    try {
      setShowDeleteConfirm(false);
      setLoading(true);
      
      const clientCode = getClientCode();
      if (!clientCode) {
        toast.error('Client code not found. Please login again.');
        return;
      }

      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/Device/DeleteAllRFID',
        {
          ClientCode: clientCode,
          Ids: selectedTags
        },
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && response.data.success !== false) {
        toast.success('Tags deleted successfully');
        
        const userInfo = JSON.parse(localStorage.getItem('userInfo'));
        addNotification({
          title: 'Tags Deleted',
          description: `${selectedTags.length} tag(s) deleted by ${userInfo?.Username || userInfo?.UserName || 'User'}`,
          type: 'success'
        });

        setSelectedTags([]);
        await fetchRFIDData();
      } else {
        throw new Error(response.data?.message || 'Failed to delete tags');
      }
    } catch (err) {
      console.error('Delete error:', err);
      toast.error(err.message || 'Failed to delete tags');
    } finally {
      setLoading(false);
    }
  };

  // Handle edit functions
  const handleEditEPC = (id, currentValue) => {
    setEditingRows(prev => new Set([...prev, id]));
    setEditedValues(prev => ({ ...prev, [id]: currentValue }));
  };

  const handleSaveEPC = async (id) => {
    try {
      const newValue = editedValues[id];
      if (!newValue || newValue.trim() === '') {
        toast.error('EPC value cannot be empty');
        return;
      }

      // Find the item being edited
      const item = rfidData.find(item => item.Id === id);
      if (!item) {
        toast.error('Item not found');
        return;
      }

      const clientCode = getClientCode();
      if (!clientCode) {
        toast.error('Client code not found. Please login again.');
        return;
      }

      // Make API call to update the TID value
      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/ProductMaster/UpdateClientTidValue',
        {
          ClientCode: clientCode,
          BarcodeNumber: item.BarcodeNumber,
          NewTidValue: newValue
        },
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && response.data.success !== false) {
        // Update the local state with new EPC value
      setRfidData(prev => prev.map(item => 
        item.Id === id ? { ...item, TidValue: newValue } : item
      ));

      // Remove from editing state
      setEditingRows(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });

      // Remove from edited values
      setEditedValues(prev => {
        const newValues = { ...prev };
        delete newValues[id];
        return newValues;
      });

      toast.success('EPC value updated successfully');
      
      // Add notification
      const userInfo = JSON.parse(localStorage.getItem('userInfo'));
      addNotification({
        title: 'EPC Value Updated',
          description: `EPC value updated to: ${newValue} for RFID Code: ${item.BarcodeNumber} by ${userInfo?.Username || userInfo?.UserName || 'User'}`,
        type: 'success'
      });
      } else {
        throw new Error(response.data?.message || 'Failed to update EPC value');
      }

    } catch (error) {
      console.error('Error updating EPC value:', error);
      toast.error(error.message || 'Failed to update EPC value');
    }
  };

  const handleCancelEdit = (id) => {
    setEditingRows(prev => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
    
    setEditedValues(prev => {
      const newValues = { ...prev };
      delete newValues[id];
      return newValues;
    });
  };

  const handleEPCChange = (id, value) => {
    setEditedValues(prev => ({ ...prev, [id]: value }));
  };


  if (error) {
    return (
      <NetworkErrorState error={error} onRetry={fetchRFIDData} />
    );
  }

  return (
    <div style={{ fontFamily: 'var(--font-family)', padding: 12, fontSize: 11, minHeight: '100%', background: '#ffffff' }}>
      {/* Unified Header & Action Section */}
      <div style={{ background: '#ffffff', borderRadius: 12, overflow: 'hidden', marginBottom: 12, boxShadow: '0 4px 24px rgba(15, 23, 42, 0.06)', border: '1px solid #e2e8f0' }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg, #0f766e 0%, #0d9488 50%, #14b8a6 100%)' }} />
        <div style={{ padding: '14px 16px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px'
        }}>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <h2 style={{
              margin: 0,
              fontSize: windowWidth <= 768 ? '1.05rem' : '1.18rem',
              fontWeight: 800,
              color: '#0f172a',
              lineHeight: '1.2'
            }}>RFID Tags</h2>
            <p style={{ margin: '6px 0 0', fontSize: 11, color: '#64748b', fontWeight: 600 }}>Sample Out style grid · <strong style={{ color: '#0f766e' }}>{ITEMS_PER_PAGE}</strong> rows per page</p>
          </div>
          <div style={{
            fontSize: '12px',
            color: '#64748b',
            fontWeight: 600
          }}>
            Total: {totalRecords} records
          </div>
        </div>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          paddingTop: 12,
          borderTop: '1px solid #e5e7eb'
        }}>
          {/* Search Input */}
          <div style={{
            position: 'relative',
            flex: '1',
            minWidth: windowWidth <= 768 ? '100%' : '250px',
            maxWidth: windowWidth <= 768 ? '100%' : '380px'
          }}>
            <FaSearch style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#94a3b8',
              fontSize: '14px',
              zIndex: 1
            }} />
            <input
              type="text"
              placeholder="Search by RFID Code, EPC Value, TID Value..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                width: '100%',
                height: 32,
                padding: '0 10px 0 30px',
                fontSize: '11px',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                outline: 'none',
                transition: 'all 0.2s',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
              onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>
          {/* Action Buttons */}
          <button
            onClick={handleDelete}
            disabled={selectedTags.length === 0}
            style={{
              height: 32,
              padding: '0 12px',
              fontSize: '11px',
              fontWeight: 700,
              borderRadius: '8px',
              border: '1px solid #ef4444',
              background: selectedTags.length === 0 ? '#f1f5f9' : '#ffffff',
              color: selectedTags.length === 0 ? '#94a3b8' : '#ef4444',
              cursor: selectedTags.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (selectedTags.length > 0) {
                e.target.style.background = '#ef4444';
                e.target.style.color = '#ffffff';
              }
            }}
            onMouseLeave={(e) => {
              if (selectedTags.length > 0) {
                e.target.style.background = '#ffffff';
                e.target.style.color = '#ef4444';
              }
            }}
          >
            <FaTrash /> Delete
          </button>
          <button
            onClick={() => setShowExportModal(true)}
            style={{
              height: 32,
              padding: '0 12px',
              fontSize: '11px',
              fontWeight: 700,
              borderRadius: '8px',
              border: '1px solid #0d9488',
              background: '#ffffff',
              color: '#0d9488',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = '#0d9488';
              e.target.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = '#ffffff';
              e.target.style.color = '#0d9488';
            }}
          >
            <HiOutlineArrowUpTray /> Export
          </button>
        </div>
        </div>
      </div>

      {/* Table Container */}
      <div style={{ background: '#ffffff', borderRadius: 12, marginTop: 8, boxShadow: '0 4px 24px rgba(15, 23, 42, 0.06)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', overflowY: 'visible', width: '100%', maxWidth: '100%' }}>
          <table style={{ 
            width: '100%',
            borderCollapse: 'separate',
            borderSpacing: 0,
            fontSize: windowWidth <= 768 ? 10 : 11,
            tableLayout: 'auto'
          }}>
            <thead>
              <tr style={{
                background: '#f4f4f5',
                borderBottom: '2px solid #d4d4d8'
              }}>
                <th style={{
                  padding: '12px',
                  textAlign: 'center',
                  width: '40px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#475569'
                }}>
                  <input
                    type="checkbox"
                    onChange={handleSelectAll}
                    checked={currentTableData.length > 0 && currentTableData.every(item => selectedTags.includes(item.Id))}
                    style={{
                      cursor: 'pointer',
                      width: '16px',
                      height: '16px'
                    }}
                  />
                </th>
                <th style={{
                  padding: '12px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#475569',
                  whiteSpace: 'nowrap'
                }}>Sr No.</th>
                <th style={{
                  padding: '12px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#475569',
                  whiteSpace: 'nowrap'
                }}>RFID Code</th>
                <th style={{
                  padding: '12px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#475569',
                  whiteSpace: 'nowrap'
                }}>EPC Value</th>
                <th style={{
                  padding: '12px',
                  textAlign: 'center',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#475569',
                  whiteSpace: 'nowrap'
                }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {totalRecords === 0 ? (
                <tr>
                  <td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                    No tags found
                  </td>
                </tr>
              ) : (
                paddedTableSlots.map((slot, index) => {
                  if (slot.kind === 'pad') {
                    return (
                      <tr key={slot.key} style={{ background: index % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                        <td colSpan="5" style={{ height: 34, borderBottom: '1px solid #f1f5f9' }} />
                      </tr>
                    );
                  }
                  const item = slot.item;
                  const globalIndex = (currentPage - 1) * ITEMS_PER_PAGE + index;
                  const isSelected = selectedTags.includes(item.Id);
                  return (
                    <tr
                      key={item.Id}
                      onClick={() => handleSelectTag(item.Id)}
                      style={{
                        cursor: 'pointer',
                        borderBottom: '1px solid #e5e7eb',
                        background: isSelected 
                          ? '#ecfeff' 
                          : globalIndex % 2 === 0 
                          ? '#ffffff' 
                          : '#fafafa',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background = '#f0fdfa';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background = globalIndex % 2 === 0 ? '#ffffff' : '#fafafa';
                        }
                      }}
                    >
                      <td style={{
                        padding: '12px',
                        textAlign: 'center',
                        fontSize: '12px'
                      }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectTag(item.Id)}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            cursor: 'pointer',
                            width: '16px',
                            height: '16px'
                          }}
                        />
                      </td>
                      <td style={{
                        padding: '12px',
                        fontSize: '12px',
                        color: '#1e293b',
                        whiteSpace: 'nowrap'
                      }}>{globalIndex + 1}</td>
                      <td style={{
                        padding: '12px',
                        fontSize: '12px',
                        color: '#1e293b',
                        whiteSpace: 'nowrap',
                        fontWeight: 600
                      }}>{item.BarcodeNumber}</td>
                      <td style={{
                        padding: '12px',
                        fontSize: '12px',
                        color: '#1e293b',
                        whiteSpace: 'nowrap',
                        fontFamily: 'monospace'
                      }}>
                        {editingRows.has(item.Id) ? (
                          <input
                            type="text"
                            value={editedValues[item.Id] || ''}
                            onChange={(e) => handleEPCChange(item.Id, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              fontSize: '12px',
                              padding: '6px 10px',
                              border: '1px solid #3b82f6',
                              borderRadius: '6px',
                              outline: 'none',
                              width: '100%',
                              maxWidth: '300px',
                              fontFamily: 'monospace'
                            }}
                            autoFocus
                          />
                        ) : (
                          item.TidValue || item.EPCValue || 'N/A'
                        )}
                      </td>
                      <td style={{
                        padding: '12px',
                        textAlign: 'center',
                        fontSize: '12px'
                      }} onClick={(e) => e.stopPropagation()}>
                        {editingRows.has(item.Id) ? (
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button
                              onClick={() => handleSaveEPC(item.Id)}
                              style={{
                                padding: '4px 10px',
                                fontSize: '10px',
                                fontWeight: 600,
                                borderRadius: '6px',
                                border: '1px solid #10b981',
                                background: '#ffffff',
                                color: '#10b981',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.target.style.background = '#10b981';
                                e.target.style.color = '#ffffff';
                              }}
                              onMouseLeave={(e) => {
                                e.target.style.background = '#ffffff';
                                e.target.style.color = '#10b981';
                              }}
                              title="Save"
                            >
                              <FaCheck />
                            </button>
                            <button
                              onClick={() => handleCancelEdit(item.Id)}
                              style={{
                                padding: '4px 10px',
                                fontSize: '10px',
                                fontWeight: 600,
                                borderRadius: '6px',
                                border: '1px solid #64748b',
                                background: '#ffffff',
                                color: '#64748b',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.target.style.background = '#64748b';
                                e.target.style.color = '#ffffff';
                              }}
                              onMouseLeave={(e) => {
                                e.target.style.background = '#ffffff';
                                e.target.style.color = '#64748b';
                              }}
                              title="Cancel"
                            >
                              <FaTimes />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleEditEPC(item.Id, item.TidValue || item.EPCValue)}
                            style={{
                              padding: '4px 12px',
                              fontSize: '10px',
                              fontWeight: 600,
                              borderRadius: '6px',
                              border: '1px solid #3b82f6',
                              background: '#ffffff',
                              color: '#3b82f6',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.background = '#3b82f6';
                              e.target.style.color = '#ffffff';
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.background = '#ffffff';
                              e.target.style.color = '#3b82f6';
                            }}
                            title="Edit EPC Value"
                          >
                            <FaEdit />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 14px',
            borderTop: '1px solid #e5e7eb',
            background: '#f8fafc',
            borderRadius: '0 0 12px 12px',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
              fontSize: '12px',
              color: '#64748b'
            }}>
              <span>
                Showing {totalRecords === 0 ? 0 : ((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, totalRecords)} of {totalRecords} entries · {ITEMS_PER_PAGE}/page
              </span>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flexWrap: 'wrap'
            }}>
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  background: currentPage === 1 ? '#f1f5f9' : '#ffffff',
                  color: currentPage === 1 ? '#94a3b8' : '#475569',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (currentPage !== 1) {
                    e.target.style.background = '#f8fafc';
                    e.target.style.borderColor = '#cbd5e1';
                  }
                }}
                onMouseLeave={(e) => {
                  if (currentPage !== 1) {
                    e.target.style.background = '#ffffff';
                    e.target.style.borderColor = '#e2e8f0';
                  }
                }}
              >
                Previous
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let page;
                if (totalPages <= 5) {
                  page = i + 1;
                } else if (currentPage <= 3) {
                  page = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  page = totalPages - 4 + i;
                } else {
                  page = currentPage - 2 + i;
                }
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    style={{
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      borderRadius: '6px',
                      border: '1px solid #e2e8f0',
                      background: currentPage === page ? '#0d9488' : '#ffffff',
                      color: currentPage === page ? '#ffffff' : '#475569',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (currentPage !== page) {
                        e.target.style.background = '#f8fafc';
                        e.target.style.borderColor = '#cbd5e1';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (currentPage !== page) {
                        e.target.style.background = '#ffffff';
                        e.target.style.borderColor = '#e2e8f0';
                      }
                    }}
                  >
                    {page}
                  </button>
                );
              })}
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  background: currentPage === totalPages ? '#f1f5f9' : '#ffffff',
                  color: currentPage === totalPages ? '#94a3b8' : '#475569',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (currentPage !== totalPages) {
                    e.target.style.background = '#f8fafc';
                    e.target.style.borderColor = '#cbd5e1';
                  }
                }}
                onMouseLeave={(e) => {
                  if (currentPage !== totalPages) {
                    e.target.style.background = '#ffffff';
                    e.target.style.borderColor = '#e2e8f0';
                  }
                }}
              >
                Next
              </button>
              {/* Go to Page */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginLeft: '8px',
                paddingLeft: '8px',
                borderLeft: '1px solid #e2e8f0'
              }}>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Go to:</span>
                <input
                  type="text"
                  value={pageInput}
                  onChange={handlePageInputChange}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handlePageInputSubmit(e);
                    }
                  }}
                  placeholder="Page"
                  style={{
                    width: '60px',
                    padding: '6px 8px',
                    fontSize: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    outline: 'none',
                    textAlign: 'center',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                  onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                />
                <button
                  onClick={handlePageInputSubmit}
                  disabled={!pageInput || pageInput === ''}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    borderRadius: '6px',
                    border: '1px solid #0d9488',
                    background: (!pageInput || pageInput === '') ? '#f1f5f9' : '#ffffff',
                    color: (!pageInput || pageInput === '') ? '#94a3b8' : '#0d9488',
                    cursor: (!pageInput || pageInput === '') ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (pageInput && pageInput !== '') {
                      e.target.style.background = '#0d9488';
                      e.target.style.color = '#ffffff';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (pageInput && pageInput !== '') {
                      e.target.style.background = '#ffffff';
                      e.target.style.color = '#0d9488';
                    }
                  }}
                >
                  Go
                </button>
              </div>
            </div>
          </div>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0" style={{ borderRadius: '8px' }}>
              <div className="modal-header border-0 pb-2">
                <h5 className="modal-title fw-bold" style={{ fontSize: '16px' }}>Export RFID Tags</h5>
                <button 
                  type="button" 
                  className="btn-close"
                  onClick={() => setShowExportModal(false)}
                ></button>
      </div>
              <div className="modal-body pt-0">
                <p className="text-muted mb-3" style={{ fontSize: '13px' }}>Choose your preferred export format</p>
                
                <div className="d-grid gap-2">
                  <button 
                    className="btn btn-outline-success text-start p-3"
                    onClick={handleExportExcel}
                    style={{ fontSize: '13px' }}
                  >
                    <div className="d-flex align-items-center gap-3">
                      <div className="bg-success rounded p-2">
                        <FaFileExcel className="text-white" style={{ fontSize: '16px' }} />
                      </div>
                      <div>
                        <div className="fw-bold">Export as Excel</div>
                        <small className="text-muted">Download as .xlsx spreadsheet file</small>
                      </div>
                    </div>
                  </button>

                  <button 
                    className="btn btn-outline-danger text-start p-3"
                    onClick={handleExportPDF}
                    style={{ fontSize: '13px' }}
                  >
                    <div className="d-flex align-items-center gap-3">
                      <div className="bg-danger rounded p-2">
                        <FaFilePdf className="text-white" style={{ fontSize: '16px' }} />
        </div>
                      <div>
                        <div className="fw-bold">Export as PDF</div>
                        <small className="text-muted">Download as formatted PDF document</small>
                      </div>
                    </div>
                  </button>

                  <div className="border rounded p-3" style={{ fontSize: '13px' }}>
                    <div className="d-flex align-items-center gap-3 mb-2">
                      <div className="bg-primary rounded p-2">
                        <FaEnvelope className="text-white" style={{ fontSize: '16px' }} />
                      </div>
                      <div>
                        <div className="fw-bold">Send to Email</div>
                        <small className="text-muted">Send data to specified email address</small>
                      </div>
                    </div>
                    <div className="input-group input-group-sm">
                      <input
                        type="email"
                        className="form-control"
                        placeholder="Enter email address"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        style={{ fontSize: '12px' }}
                      />
                      <button 
                        className="btn btn-primary"
                        onClick={handleEmailExport}
                        disabled={!emailInput}
                        style={{ fontSize: '12px' }}
                      >
                        Send
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0" style={{ borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>
              <div className="modal-header border-0 pb-0">
                <h5 className="modal-title fw-bold text-danger" style={{ fontSize: '18px' }}>
                   <FaTrash className="me-2" /> Delete Confirmation
                </h5>
                <button 
                  type="button" 
                  className="btn-close"
                  onClick={() => setShowDeleteConfirm(false)}
                ></button>
              </div>
              <div className="modal-body py-4">
                <p className="mb-0" style={{ fontSize: '14px', color: '#4b5563' }}>
                  Are you sure you want to delete <strong>{selectedTags.length}</strong> selected tag(s)?
                  <br/>
                  <span className="text-danger mt-2 d-block" style={{ fontSize: '12px' }}>This action cannot be undone.</span>
                </p>
              </div>
              <div className="modal-footer border-0 pt-0">
                <button 
                  type="button" 
                  className="btn btn-light"
                  onClick={() => setShowDeleteConfirm(false)}
                  style={{ fontSize: '13px', fontWeight: 500 }}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="btn btn-danger"
                  onClick={handleConfirmDelete}
                  style={{ fontSize: '13px', fontWeight: 500, padding: '8px 20px' }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        * {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        *::-webkit-scrollbar {
          display: none;
        }
        body, html {
          overflow-x: hidden;
          box-sizing: border-box;
        }
        @media (max-width: 768px) {
          .table-responsive {
            font-size: 10px;
          }
        }
        @media (max-width: 480px) {
          .table-responsive {
            font-size: 10px;
          }
        }
      `}</style>
    </div>
  );
};

export default RFIDTags; 