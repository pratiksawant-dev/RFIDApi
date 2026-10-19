import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  FaUserPlus,
  FaBox,
  FaSearch,
  FaRedo,
  FaDatabase,
  FaChevronLeft,
  FaChevronRight,
  FaChevronUp,
  FaChevronDown,
  FaFileInvoice,
  FaCheckCircle,
  FaTimes
} from 'react-icons/fa';
import { useLoading } from '../../App';
import { useNotifications } from '../../context/NotificationContext';
import { useNavigate } from 'react-router-dom';
import useMyScansFileWatcher from '../../hooks/useMyScansFileWatcher';
import { BsUpcScan } from 'react-icons/bs';
import { toast } from 'react-toastify';
import PageHeader from '../common/PageHeader';

const QuotationWithRFIDTray = ({ editStatus, defaultValues }) => {
  const { loading, setLoading } = useLoading();
  const { addNotification } = useNotifications();
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  // Quotation Header State
  const [quotationNumber, setQuotationNumber] = useState('');
  const [quotationDate, setQuotationDate] = useState(new Date().toISOString().split('T')[0]);
  const [customerName, setCustomerName] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerDropdownRef = useRef(null);
  const [customerList, setCustomerList] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customerMobile, setCustomerMobile] = useState('');
  const [fineGold, setFineGold] = useState('0.000');
  const [advanceAmount, setAdvanceAmount] = useState('0.00');
  const [balanceAmount, setBalanceAmount] = useState('0.000');

  // RFID Tray State
  const [rfidTrayInput, setRfidTrayInput] = useState('');
  const [rfidTags, setRfidTags] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(40); // 10 rows × 4 columns = 40 items per page
  const [stockData, setStockData] = useState([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [isRfidTrayCollapsed, setIsRfidTrayCollapsed] = useState(false);
  const [stockCurrentPage, setStockCurrentPage] = useState(1);
  const [stockItemsPerPage] = useState(20); // Products per page
  const [showQuotationSuccess, setShowQuotationSuccess] = useState(false);
  const [quotationSuccessData, setQuotationSuccessData] = useState(null);
  const fileInputRef = React.useRef(null);
  
  // File Watcher State
  const [watchEnabled, setWatchEnabled] = useState(false);
  const {
    status: watcherStatus,
    epcArray: scannedEpcs,
    scanDate: scannedDate,
    error: watcherError,
    start: startWatcher,
    stop: stopWatcher,
    sendCommand
  } = useMyScansFileWatcher({
    intervalMs: 2000,
    enabled: watchEnabled,
    onEpcsReceived: async (epcs, date) => {
      // When EPCs are received from Scandate file, process them
      if (epcs && epcs.length > 0) {
        console.log('EPCs received from file:', epcs, 'Date:', date);
        
        // Update RFID tags state (store EPCs, but don't send to API yet)
        setRfidTags(prevTags => {
          // Merge with existing tags, avoiding duplicates
          const existingSet = new Set(prevTags);
          epcs.forEach(epc => existingSet.add(epc));
          return Array.from(existingSet);
        });
        
        // Don't send to API automatically - user must click "Find Stock" button
        console.log('✅ EPCs loaded from file watcher:', epcs.length, 'EPC(s)');
        
        // Show notification
        addNotification({
          type: 'success',
          title: 'EPCs Scanned',
          message: `Received ${epcs.length} EPC(s) from file${date ? ` (Date: ${date})` : ''}. Click "Find Stock" to fetch stock data.`
        });
      }
    },
    onError: (err) => {
      console.error('File watcher error:', err);
      addNotification({
        type: 'error',
        title: 'File Watcher Error',
        message: err?.message || 'Error reading scan files'
      });
    }
  });

  // Normalize response data helper
  const normalizeArray = (data) => {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      return data.data || data.items || data.results || data.list || [];
    }
    return [];
  };

  const getCustomerDisplayName = (customer) => {
    if (!customer) return '';
    if (customer.FirstName) {
      return `${customer.FirstName}${customer.LastName ? ` ${customer.LastName}` : ''}`.trim();
    }
    return customer.Name || customer.CustomerName || 'Unknown';
  };

  const normalizePartyQuery = (s) =>
    String(s || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();

  const toProperPersonName = (str) => {
    if (!str || typeof str !== 'string') return '';
    return str
      .trim()
      .split(/\s+/)
      .map((word) => {
        if (!word) return '';
        if (word.length === 1) return word.toUpperCase();
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');
  };

  const customerAccentColor = '#22c55e';
  const quotationCustomerDropdownPanel = {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    background: '#ffffff',
    border: '1px solid #dbe4f0',
    borderRadius: 10,
    boxShadow: '0 16px 32px rgba(15, 23, 42, 0.14)',
    marginTop: 6,
    maxHeight: 280,
    overflowY: 'auto',
    zIndex: 1100,
  };

  // Fetch user info
  useEffect(() => {
    const storedUserInfo = localStorage.getItem('userInfo');
    if (storedUserInfo) {
      try {
        const parsed = JSON.parse(storedUserInfo);
        setUserInfo(parsed);
      } catch (err) {
        console.error('Error parsing user info:', err);
      }
    }
  }, []);

  // Fetch customers - Using GetAllCustomer API
  const fetchCustomers = async () => {
    if (!userInfo?.ClientCode) return;
    
    setLoadingCustomers(true);
    try {
      const headers = {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      };
      
      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/ClientOnboarding/GetAllCustomer',
        { ClientCode: userInfo.ClientCode },
        { headers }
      );
      
      const customers = normalizeArray(response.data);
      setCustomerList(customers);
    } catch (error) {
      console.error('Error fetching customers:', error);
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to load customers. Please refresh the page.'
      });
    } finally {
      setLoadingCustomers(false);
    }
  };

  // Update customer details when customer Id is selected (Sample Out–style typeahead)
  useEffect(() => {
    if (customerName && customerList.length > 0) {
      const customer = customerList.find(c => c.Id == customerName || c.Id === customerName);
      if (customer) {
        setCustomerMobile(customer.Mobile || customer.MobileNumber || '');
        setFineGold(customer.FineGold ? parseFloat(customer.FineGold).toFixed(3) : '0.000');
        setAdvanceAmount(customer.AdvanceAmount ? parseFloat(customer.AdvanceAmount).toFixed(2) : '0.00');
        setBalanceAmount(customer.BalanceAmount ? parseFloat(customer.BalanceAmount).toFixed(3) : '0.000');
        setCustomerSearch(toProperPersonName(getCustomerDisplayName(customer)));
      } else {
        setCustomerMobile('');
        setFineGold('0.000');
        setAdvanceAmount('0.00');
        setBalanceAmount('0.000');
      }
    } else if (!customerName) {
      setCustomerMobile('');
      setFineGold('0.000');
      setAdvanceAmount('0.00');
      setBalanceAmount('0.000');
    }
  }, [customerName, customerList]);

  useEffect(() => {
    const hasQuery = customerSearch.trim().length > 0;
    if (!hasQuery) {
      setFilteredCustomers([]);
      setShowCustomerDropdown(false);
      return;
    }
    const searchTerm = customerSearch.toLowerCase();
    const filtered = customerList.filter((customer) => {
      const firstName = (customer.FirstName || '').toLowerCase();
      const lastName = (customer.LastName || '').toLowerCase();
      const name = (customer.Name || '').toLowerCase();
      const cName = (customer.CustomerName || '').toLowerCase();
      const mobile = (customer.Mobile || customer.MobileNumber || '').toLowerCase();
      return (
        firstName.includes(searchTerm) ||
        lastName.includes(searchTerm) ||
        name.includes(searchTerm) ||
        cName.includes(searchTerm) ||
        mobile.includes(searchTerm)
      );
    });
    const selected = customerName
      ? customerList.find((c) => String(c.Id) === String(customerName))
      : null;
    const lockedLabel = selected
      ? normalizePartyQuery(toProperPersonName(getCustomerDisplayName(selected)))
      : '';
    const q = normalizePartyQuery(customerSearch);
    const selectionLocksDropdown = Boolean(selected && lockedLabel && q === lockedLabel);

    setFilteredCustomers(filtered);
    setShowCustomerDropdown(!selectionLocksDropdown);
  }, [customerSearch, customerList, customerName]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleQuotationCustomerSelect = (customer) => {
    setCustomerName(customer.Id);
    setShowCustomerDropdown(false);
  };

  const quotationCustomerDropdownOpen =
    showCustomerDropdown && customerSearch.trim().length > 0;

  // Fetch quotation number
  const fetchQuotationNumber = async () => {
    if (!userInfo?.ClientCode) return;
    
    try {
      const headers = {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      };
      
      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/Order/LastQuotationNo',
        { ClientCode: userInfo.ClientCode },
        { headers }
      );
      
      const lastQuotationNo = response.data?.LastQuotationNo || 
                              response.data?.lastQuotationNo || 
                              response.data?.QuotationNo ||
                              response.data?.quotationNo ||
                              response.data?.Number ||
                              response.data?.number ||
                              response.data;
      
      if (lastQuotationNo !== undefined && lastQuotationNo !== null) {
        const lastNumber = parseInt(lastQuotationNo) || 0;
        const nextNumber = lastNumber + 1;
        setQuotationNumber(nextNumber.toString());
      } else {
        setQuotationNumber('1');
      }
    } catch (error) {
      console.error('Error fetching quotation number:', error);
      setQuotationNumber('1');
    }
  };

  // Window resize handler
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load data on mount
  useEffect(() => {
    if (userInfo?.ClientCode) {
      fetchCustomers();
      if (!editStatus) {
        fetchQuotationNumber();
      }
    }
  }, [userInfo]);

  // Parse RFID Tray Input - Split into 24 character chunks
  const parseRfidTray = (input) => {
    if (!input || input.trim() === '') {
      setRfidTags([]);
      return;
    }

    // Remove any whitespace or newlines
    const cleanInput = input.replace(/\s+/g, '').toUpperCase();
    
    // Split into chunks of 24 characters
    const tagLength = 24;
    const tags = [];
    
    for (let i = 0; i < cleanInput.length; i += tagLength) {
      const tag = cleanInput.substr(i, tagLength);
      if (tag.length === tagLength) {
        tags.push(tag);
      }
    }
    
    setRfidTags(tags);
  };

  // Handle RFID Tray Input Change
  const handleRfidTrayChange = (e) => {
    const value = e.target.value;
    setRfidTrayInput(value);
    parseRfidTray(value);
  };

  // Clear RFID Tray
  const clearRfidTray = () => {
    setRfidTrayInput('');
    setRfidTags([]);
    setCurrentPage(1);
    setStockData([]);
    setShowQuotationSuccess(false);
    setQuotationSuccessData(null);
  };

  // Reset RFID Tray
  const resetRfidTray = () => {
    clearRfidTray();
  };

  // Find Stock for RFID Tags (can accept EPCs as parameter or use state)
  const findStockForRfidTags = async (epcsToSearch = null) => {
    const tagsToSearch = epcsToSearch || rfidTags;
    
    if (tagsToSearch.length === 0) {
      addNotification({
        type: 'warning',
        title: 'No Tags',
        message: 'Please add RFID tags first before searching for stock.'
      });
      return;
    }

    if (!userInfo?.ClientCode) {
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'User information not available. Please refresh the page.'
      });
      return;
    }

    setLoadingStock(true);
    try {
      const headers = {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      };

      const payload = {
        ClientCode: userInfo.ClientCode,
        TIDNumbers: tagsToSearch
      };

      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/ProductMaster/GetLabelledStockByTIDNumbers',
        payload,
        { headers }
      );

      const stockItems = normalizeArray(response.data);
      setStockData(stockItems);

      if (stockItems.length === 0) {
        addNotification({
          type: 'info',
          title: 'No Stock Found',
          message: 'No stock found for the provided RFID tags.'
        });
        setIsRfidTrayCollapsed(false);
      } else {
        addNotification({
          type: 'success',
          title: 'Stock Found',
          message: `Found ${stockItems.length} product(s) for the scanned RFID tags.`
        });
        setIsRfidTrayCollapsed(true); // Collapse RFID tray when stock loads
        setStockCurrentPage(1); // Reset to first page
      }
      
    } catch (error) {
      console.error('Error finding stock:', error);
      addNotification({
        type: 'error',
        title: 'Error',
        message: error.response?.data?.message || 'Failed to find stock. Please try again.'
      });
      setStockData([]);
    } finally {
      setLoadingStock(false);
    }
  };

  // Alias for backward compatibility
  const findStockForEpcs = findStockForRfidTags;

  // File Watcher Controls
  const handleStartWatcher = async () => {
    setLoading(true);
    try {
      // Read ScanData.json file immediately when Start is clicked
      const epcsRead = await readScanDataFileImmediately();
      
      // If EPCs were read successfully, they will be displayed in the table below
      if (epcsRead && epcsRead.length > 0) {
        console.log(`✅ Successfully loaded ${epcsRead.length} EPCs from file`);
        toast.success(`${epcsRead.length} EPC(s) loaded. Click "Find Stock" to fetch stock data.`);
      } else {
        toast.warning('No EPCs found in scan file');
      }
      
      // Also start continuous watching
      await sendCommand('start');
      setWatchEnabled(true);
      startWatcher();
      toast.success('File watcher started');
    } catch (e) {
      console.error('Error starting watcher:', e);
      toast.error(e?.message || 'Could not start watcher');
    } finally {
      setLoading(false);
    }
  };

  // Read ScanData.json file immediately (not waiting for polling)
  const readScanDataFileImmediately = async () => {
    console.log('🔍 Starting to read ScanData.json file...');
    const filePath = 'C:\\loyalstring\\MyScans\\ScanData.json';
    let epcsRead = [];
    
    try {
      // Method 1: Electron
      if (typeof window !== 'undefined' && window.electron && window.electron.readFile) {
        console.log('📱 Trying Electron file read...');
        try {
          const content = await window.electron.readFile(filePath);
          console.log('✅ Electron read successful, content length:', content?.length);
          
          if (content) {
            const parsed = JSON.parse(content);
            console.log('✅ Parsed JSON, array length:', Array.isArray(parsed) ? parsed.length : 'Not an array');
            
            if (Array.isArray(parsed) && parsed.length > 0) {
              epcsRead = parsed.filter(item => typeof item === 'string' && item.trim().length > 0);
              console.log('✅ Valid EPCs found:', epcsRead.length);
              
              if (epcsRead.length > 0) {
                // Update RFID tags state (store EPCs, but don't send to API yet)
                setRfidTags(prevTags => {
                  const existingSet = new Set(prevTags);
                  epcsRead.forEach(epc => existingSet.add(epc.trim()));
                  return Array.from(existingSet);
                });
                
                console.log('✅ EPCs loaded and stored:', epcsRead.length, 'EPC(s)');
                console.log('📋 EPCs:', epcsRead);
                
                addNotification({
                  type: 'success',
                  title: 'EPCs Loaded',
                  message: `Loaded ${epcsRead.length} EPC(s) from ScanData.json. Click "Find Stock" to fetch stock data.`
                });
                return epcsRead;
              }
            }
          }
        } catch (err) {
          console.error('❌ Electron file read failed:', err);
          console.error('Error details:', err.message, err.stack);
        }
      } else {
        console.log('⚠️ Electron not available');
      }
      
      // Method 2: API endpoint
      console.log('🌐 Trying API endpoint to read file...');
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          throw new Error('No authentication token found');
        }

        const response = await fetch('https://rrgold.loyalstring.co.in/api/FileWatcher/GetScanData', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            filePath: filePath
          })
        });
        
        console.log('📡 API Response status:', response.status, response.statusText);
        
        if (response.ok) {
          const data = await response.json();
          console.log('✅ API response received:', data);
          
          const content = data.content || data.data || data;
          let parsed;
          
          if (typeof content === 'string') {
            try {
              parsed = JSON.parse(content);
            } catch (parseErr) {
              console.error('❌ Failed to parse content as JSON:', parseErr);
              // Try to parse as array of strings directly
              if (content.trim().startsWith('[')) {
                parsed = JSON.parse(content);
              } else {
                throw parseErr;
              }
            }
          } else {
            parsed = content;
          }
          
          console.log('✅ Parsed data, is array:', Array.isArray(parsed), 'length:', Array.isArray(parsed) ? parsed.length : 'N/A');
          
          if (Array.isArray(parsed) && parsed.length > 0) {
            epcsRead = parsed.filter(item => typeof item === 'string' && item.trim().length > 0);
            console.log('✅ Valid EPCs found:', epcsRead.length, epcsRead);
            
            if (epcsRead.length > 0) {
              // Update RFID tags state (store EPCs, but don't send to API yet)
              setRfidTags(prevTags => {
                const existingSet = new Set(prevTags);
                epcsRead.forEach(epc => existingSet.add(epc.trim()));
                return Array.from(existingSet);
              });
              
              console.log('✅ EPCs loaded and stored:', epcsRead.length, 'EPC(s)');
              console.log('📋 EPCs:', epcsRead);
              
              addNotification({
                type: 'success',
                title: 'EPCs Loaded',
                message: `Loaded ${epcsRead.length} EPC(s) from ScanData.json. Click "Find Stock" to fetch stock data.`
              });
              return epcsRead;
            } else {
              console.warn('⚠️ No valid EPCs found in array');
              addNotification({
                type: 'warning',
                title: 'No EPCs Found',
                message: 'The scan file is empty or contains no valid EPC codes.'
              });
            }
          } else {
            console.warn('⚠️ Response is not a valid array:', parsed);
            addNotification({
              type: 'warning',
              title: 'Invalid File Format',
              message: 'The scan file does not contain a valid array of EPC codes.'
            });
          }
        } else {
          const errorText = await response.text();
          console.error('❌ API request failed:', response.status, errorText);
          throw new Error(`Failed to read file: ${response.status} ${errorText}`);
        }
      } catch (err) {
        console.error('❌ API file read failed:', err);
        console.error('Error details:', err.message, err.stack);
        throw err;
      }
      
      // If we reach here, no EPCs were read
      if (epcsRead.length === 0) {
        addNotification({
          type: 'warning',
          title: 'File Read Error',
          message: 'Could not read EPCs from ScanData.json. Please check the file exists and contains valid EPC codes.',
          duration: 5000
        });
      }
      
      return epcsRead;
    } catch (err) {
      console.error('❌ Unexpected error reading ScanData.json:', err);
      console.error('Error details:', err.message, err.stack);
      addNotification({
        type: 'error',
        title: 'Error',
        message: err?.message || 'Failed to read ScanData.json file. Check browser console for details.'
      });
      throw err;
    }
  };

  const handleStopWatcher = async () => {
    try {
      await sendCommand('stop');
      stopWatcher();
      setWatchEnabled(false);
      toast.success('File watcher stopped');
    } catch (e) {
      toast.error(e?.message || 'Could not stop watcher');
    }
  };

  const handleResetWatcher = async () => {
    try {
      await sendCommand('clear');
      setRfidTags([]);
      setRfidTrayInput('');
      setStockData([]);
      toast.success('Watcher reset and cleared');
    } catch (e) {
      toast.error(e?.message || 'Could not reset watcher');
    }
  };

  const isScanning = (watcherStatus === 'watching') && watchEnabled;

  // Handle file input (manual file selection)
  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.log('📁 File selected:', file.name, file.size, 'bytes');
    
    try {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const content = e.target.result;
          console.log('✅ File read, content length:', content?.length);
          
          const parsed = JSON.parse(content);
          console.log('✅ Parsed JSON, is array:', Array.isArray(parsed), 'length:', Array.isArray(parsed) ? parsed.length : 'N/A');
          
          if (Array.isArray(parsed) && parsed.length > 0) {
            const epcs = parsed.filter(item => typeof item === 'string' && item.trim().length > 0);
            console.log('✅ Valid EPCs found:', epcs.length, epcs);
            
            if (epcs.length > 0) {
              // Update RFID tags state (store EPCs, but don't send to API yet)
              setRfidTags(prevTags => {
                const existingSet = new Set(prevTags);
                epcs.forEach(epc => existingSet.add(epc.trim()));
                return Array.from(existingSet);
              });
              
              console.log('✅ EPCs loaded and stored:', epcs.length, 'EPC(s)');
              console.log('📋 EPCs:', epcs);
              
              addNotification({
                type: 'success',
                title: 'EPCs Loaded',
                message: `Loaded ${epcs.length} EPC(s) from ${file.name}. Click "Find Stock" to fetch stock data.`
              });
            } else {
              addNotification({
                type: 'warning',
                title: 'No EPCs Found',
                message: 'File loaded but no valid EPC strings found. Expected format: ["EPC1", "EPC2", ...]'
              });
            }
          } else {
            addNotification({
              type: 'error',
              title: 'Invalid Format',
              message: 'File must contain a JSON array of EPC strings. Example: ["EPC1", "EPC2", "EPC3"]'
            });
          }
        } catch (parseErr) {
          console.error('❌ JSON parse error:', parseErr);
          addNotification({
            type: 'error',
            title: 'Parse Error',
            message: 'Failed to parse JSON file. Please check file format.'
          });
        }
      };
      
      reader.onerror = (err) => {
        console.error('❌ File read error:', err);
        addNotification({
          type: 'error',
          title: 'File Read Error',
          message: 'Failed to read file. Please try again.'
        });
      };
      
      reader.readAsText(file);
    } catch (err) {
      console.error('❌ Unexpected error:', err);
      addNotification({
        type: 'error',
        title: 'Error',
        message: err?.message || 'Failed to process file'
      });
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // REMOVED: Create Quotation from All Stock Products functionality
  // This function has been disabled - users should select individual products
  // Keeping function signature for potential future use but not accessible via UI
  const handleCreateQuotation_DISABLED = async () => {
    if (!customerName || customerName === '') {
      addNotification({
        type: 'warning',
        title: 'Customer Required',
        message: 'Please select a customer before creating quotation.'
      });
      return;
    }

    if (stockData.length === 0) {
      addNotification({
        type: 'warning',
        title: 'No Products',
        message: 'No products available to create quotation. Please scan RFID tags first.'
      });
      return;
    }

    if (!userInfo?.ClientCode) {
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'User information not available. Please refresh the page.'
      });
      return;
    }

    setLoading(true);
    try {
      // Prepare quotation items from all stock products
      const quotationItemArray = stockData.map(product => {
        const grossWt = parseFloat(product.GrossWt || 0);
        const netWt = parseFloat(product.NetWt || 0);
        const stoneWt = parseFloat(product.TotalStoneWeight || 0);
        const diamondWt = parseFloat(product.TotalDiamondWeight || 0);
        const ratePerGram = parseFloat(product.TodaysRate || 0);
        
        // Calculate fine gold based on purity percentage
        const purityName = product.PurityName || '';
        let finePercent = 91.6; // Default 22CT
        if (purityName.includes('24')) finePercent = 100;
        else if (purityName.includes('22')) finePercent = 91.6;
        else if (purityName.includes('18')) finePercent = 75;
        else if (purityName.includes('14')) finePercent = 58.3;
        
        const fineWt = (netWt * finePercent) / 100;
        const fineAmount = fineWt * ratePerGram;
        
        return {
          Id: 0,
          ItemCode: product.ItemCode || '',
          RFIDNumber: product.TIDNumber || product.RFIDCode || '',
          CategoryId: product.CategoryId || 0,
          ProductId: product.ProductId || 0,
          DesignId: product.DesignId || 0,
          PurityId: product.PurityId || 0,
          GrossWt: String(grossWt),
          NetWt: String(netWt),
          StoneWt: String(stoneWt),
          DiamondWt: String(diamondWt),
          FineWt: String(fineWt.toFixed(3)),
          RatePerGram: String(ratePerGram),
          FineAmount: String(fineAmount.toFixed(2)),
          StoneAmount: String(product.TotalStoneAmount || '0.00'),
          DiamondAmount: String(product.TotalDiamondAmount || '0.00'),
          MakingPerGram: String(product.MakingPerGram || '0.000'),
          MakingPercentage: String(product.MakingPercentage || '0.000'),
          MakingFixedAmt: String(product.MakingFixedAmt || '0.000'),
          HallmarkAmount: String(product.HallmarkAmount || '0.00'),
          PackingWt: String(product.PackingWeight || '0.000'),
          Qty: String(product.Quantity || 1),
          Pieces: String(product.Pieces || '1'),
          TotalItemAmt: String((fineAmount + parseFloat(product.TotalStoneAmount || 0) + parseFloat(product.MakingFixedAmt || 0)).toFixed(2))
        };
      });

      // Calculate totals
      const totalGrossWt = quotationItemArray.reduce((sum, item) => sum + parseFloat(item.GrossWt || 0), 0);
      const totalNetWt = quotationItemArray.reduce((sum, item) => sum + parseFloat(item.NetWt || 0), 0);
      const totalStoneWt = quotationItemArray.reduce((sum, item) => sum + parseFloat(item.StoneWt || 0), 0);
      const totalStoneAmount = quotationItemArray.reduce((sum, item) => sum + parseFloat(item.StoneAmount || 0), 0);
      const totalDiamondWeight = quotationItemArray.reduce((sum, item) => sum + parseFloat(item.DiamondWt || 0), 0);
      const totalDiamondAmount = quotationItemArray.reduce((sum, item) => sum + parseFloat(item.DiamondAmount || 0), 0);
      const totalDiamondPieces = quotationItemArray.reduce((sum, item) => sum + parseInt(item.Pieces || 1), 0);
      const totalQty = quotationItemArray.reduce((sum, item) => sum + parseInt(item.Qty || 1), 0);
      const totalFineMetal = quotationItemArray.reduce((sum, item) => sum + parseFloat(item.FineWt || 0), 0);
      const totalFineAmount = quotationItemArray.reduce((sum, item) => sum + parseFloat(item.FineAmount || 0), 0);
      const totalTaxableAmount = totalFineAmount + totalStoneAmount + totalDiamondAmount;
      const totalGst = (totalTaxableAmount * 0.03).toFixed(2);
      const totalNetAmount = (parseFloat(totalTaxableAmount) + parseFloat(totalGst)).toFixed(2);
      const balanceAmt = (parseFloat(totalNetAmount) - parseFloat(advanceAmount || 0)).toFixed(2);

      // Prepare quotation payload
      const quotationData = {
        ClientCode: String(userInfo.ClientCode),
        CustomerId: String(customerName),
        TotalGrossWt: String(totalGrossWt.toFixed(3)),
        TotalNetWt: String(totalNetWt.toFixed(3)),
        TotalStoneWt: String(totalStoneWt.toFixed(3)),
        TotalStoneAmount: String(totalStoneAmount.toFixed(2)),
        TotalDiamondWeight: String(totalDiamondWeight.toFixed(3)),
        TotalDiamondAmount: String(totalDiamondAmount.toFixed(2)),
        TotalDiamondPieces: String(totalDiamondPieces),
        TotalStonePieces: String(quotationItemArray.reduce((sum, item) => sum + parseInt(item.Pieces || 1), 0)),
        TotalStoneWeight: String(totalStoneWt.toFixed(3)),
        TotalPurchaseAmount: String(totalFineAmount.toFixed(2)),
        TotalTaxableAmount: String(totalTaxableAmount.toFixed(2)),
        TDS: '0.00',
        ReceivedAmount: String(advanceAmount || '0.00'),
        QuotationStatus: 'Pending',
        Visibility: 'Visible',
        Offer: '0',
        CourierCharge: '0',
        TotalAmount: String(totalNetAmount),
        BillType: 'true',
        QuotationDate: quotationDate,
        QuotationNo: String(quotationNumber),
        BalanceAmt: String(balanceAmt),
        CreditAmount: '0',
        CreditGold: '0',
        CreditSilver: '0',
        GrossWt: String(totalGrossWt.toFixed(3)),
        NetWt: String(totalNetWt.toFixed(3)),
        StoneWt: String(totalStoneWt.toFixed(3)),
        Qty: String(totalQty),
        TotalSaleGold: '0',
        TotalSaleSilver: '0',
        TotalSaleUrdGold: '0',
        TotalSaleUrdSilver: '0',
        BalanceGold: '0',
        BalanceSilver: '0',
        QuotationItem: quotationItemArray,
        TotalNetAmount: String(totalNetAmount),
        TotalFineMetal: String(totalFineMetal.toFixed(3)),
        TotalBalanceMetal: String(balanceAmt),
        GSTApplied: 'true',
        AdditionTaxApplied: 'false',
        TotalGSTAmount: String(totalGst),
        Discount: '0.000',
        BalanceAmount: String(balanceAmt),
        QuotationStoneDetails: [],
        QuotationDiamondDetails: []
      };

      const headers = {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      };

      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/Order/AddQuotation',
        quotationData,
        { headers }
      );

      if (response.data?.Status === 400 || response.data?.status === 400) {
        addNotification({
          type: 'error',
          title: 'Error',
          message: response.data?.Message || response.data?.message || 'Failed to create quotation.'
        });
      } else {
        // Show success popup
        setQuotationSuccessData({
          quotationNo: quotationNumber,
          productCount: stockData.length,
          totalAmount: totalNetAmount,
          date: quotationDate
        });
        setShowQuotationSuccess(true);
        
        addNotification({
          type: 'success',
          title: 'Quotation Generated',
          message: `Quotation #${quotationNumber} created successfully with ${stockData.length} product(s).`
        });
      }
      
    } catch (error) {
      console.error('Error creating quotation:', error);
      addNotification({
        type: 'error',
        title: 'Error',
        message: error.response?.data?.Message || error.response?.data?.message || 'Failed to create quotation. Please try again.'
      });
    } finally {
      setLoading(false);
    }
  };

  // Organize tags into 4 columns with pagination (row by row: tag 1 in col 1, tag 2 in col 2, etc.)
  const organizeTagsIntoColumns = (tags, page, perPage) => {
    // Calculate pagination
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedTags = tags.slice(startIndex, endIndex);
    const globalStartIndex = startIndex; // For correct tag numbering
    
    const columns = [[], [], [], []];
    
    paginatedTags.forEach((tag, localIndex) => {
      const globalIndex = globalStartIndex + localIndex;
      const columnIndex = localIndex % 4; // Distribute across 4 columns row by row
      columns[columnIndex].push({ tag, index: globalIndex + 1 });
    });
    
    // Calculate max rows needed
    const maxRows = Math.max(...columns.map(col => col.length));
    
    // Pad columns to have same number of rows for table display
    columns.forEach(col => {
      while (col.length < maxRows) {
        col.push(null); // Empty cell
      }
    });
    
    return { columns, maxRows };
  };

  // Pagination calculations
  const totalPages = Math.ceil(rfidTags.length / itemsPerPage);
  const { columns: tagColumns, maxRows } = organizeTagsIntoColumns(rfidTags, currentPage, itemsPerPage);

  // Handle page change
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      // Scroll to top of table
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Reset to page 1 when tags change
  useEffect(() => {
    setCurrentPage(1);
  }, [rfidTags.length]);

  const isSmallScreen = windowWidth <= 768;

  return (
    <>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    <div style={{ 
      padding: 0, 
      fontFamily: 'var(--font-family)', 
      background: '#ffffff', 
      minHeight: '100%' 
    }}>
      {/* Top Header - Compact */}
      <div className="page-top">
        <div className="page-top-inner">
          <PageHeader
            title="Quotation"
            subtitle="Price a customer order from the RFID tray before you invoice."
            barStyle={{ padding: 0, margin: 0, gap: 10, borderBottom: 'none' }}
            actions={(
              <div className="page-top-actions">
                <span className="page-lot">
                  Quotation no.
                  <strong>{quotationNumber || 'Auto'}</strong>
                </span>
                <input
                  className="page-field"
                  type="date"
                  value={quotationDate}
                  onChange={(e) => setQuotationDate(e.target.value)}
                  aria-label="Quotation date"
                  style={{ width: 148 }}
                />
              </div>
            )}
          />
        </div>
      </div>

      {/* Main Content Layout */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        marginBottom: '12px'
      }}>
        {/* Main Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Customer Information */}
          <div style={{
            background: '#ffffff',
            borderRadius: '8px',
            padding: isSmallScreen ? '10px 12px' : '12px 16px',
            marginBottom: '12px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
            border: '1px solid #e5e7eb'
          }}>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(5, 1fr)', 
              gap: '12px' 
            }}>
              {/* Customer Name */}
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '12px', 
                  fontWeight: 600, 
                  color: '#475569', 
                  marginBottom: '4px' 
                }}>
                  Customer Name<span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                  <div ref={customerDropdownRef} style={{ flex: 1, position: 'relative', minWidth: 0 }}>
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setCustomerName('');
                        setShowCustomerDropdown(true);
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = customerAccentColor;
                        e.target.style.boxShadow = `0 0 0 3px ${customerAccentColor}33`;
                        if (customerSearch.trim()) setShowCustomerDropdown(true);
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#e2e8f0';
                        e.target.style.boxShadow = 'none';
                      }}
                      placeholder="Type to search customer..."
                      disabled={loadingCustomers}
                      autoComplete="off"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        fontSize: '12px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        outline: 'none',
                        background: loadingCustomers ? '#f1f5f9' : '#ffffff',
                        boxSizing: 'border-box',
                        transition: 'all 0.2s ease',
                      }}
                    />
                    {quotationCustomerDropdownOpen && (
                      <div
                        style={{ ...quotationCustomerDropdownPanel, borderTop: `3px solid ${customerAccentColor}` }}
                        role="listbox"
                        aria-label="Customer suggestions"
                      >
                        {loadingCustomers && (
                          <div style={{ padding: '10px 12px', fontSize: 11, color: '#64748b' }}>Loading…</div>
                        )}
                        {!loadingCustomers && filteredCustomers.length === 0 && (
                          <div style={{ padding: '10px 12px', fontSize: 11, color: '#64748b' }}>
                            No matching customer found.
                          </div>
                        )}
                        {!loadingCustomers &&
                          filteredCustomers.map((customer, idx) => {
                            const displayName = toProperPersonName(getCustomerDisplayName(customer));
                            const isSelected = String(customer.Id) === String(customerName);
                            return (
                              <div
                                key={customer.Id}
                                role="option"
                                aria-selected={isSelected}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleQuotationCustomerSelect(customer);
                                }}
                                style={{
                                  padding: '10px 12px',
                                  cursor: 'pointer',
                                  fontSize: 11,
                                  borderBottom:
                                    idx < filteredCustomers.length - 1 ? '1px solid #f1f5f9' : 'none',
                                  backgroundColor: isSelected ? `${customerAccentColor}22` : '#ffffff',
                                }}
                                onMouseEnter={(e) => {
                                  if (!isSelected) e.currentTarget.style.background = '#f8fafc';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = isSelected
                                    ? `${customerAccentColor}22`
                                    : '#ffffff';
                                }}
                              >
                                <div
                                  style={{
                                    fontWeight: 600,
                                    color: '#1e293b',
                                    marginBottom: customer.Mobile || customer.MobileNumber ? 4 : 0,
                                    fontSize: 12,
                                  }}
                                >
                                  {displayName}
                                </div>
                                {customer.Mobile || customer.MobileNumber ? (
                                  <div style={{ color: '#64748b', fontSize: 11 }}>
                                    {customer.Mobile || customer.MobileNumber}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/add_customer_new')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '8px 14px',
                      fontSize: '12px',
                      fontWeight: 600,
                      borderRadius: '8px',
                      border: '1px solid #627282',
                      background: '#ffffff',
                      color: '#627282',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      flexShrink: 0,
                      height: 36,
                      boxSizing: 'border-box',
                    }}
                    title="Add New Customer"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#627282';
                      e.currentTarget.style.color = '#ffffff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#ffffff';
                      e.currentTarget.style.color = '#627282';
                    }}
                  >
                    <FaUserPlus />
                  </button>
                </div>
              </div>

              {/* Mobile */}
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '12px', 
                  fontWeight: 600, 
                  color: '#475569', 
                  marginBottom: '4px' 
                }}>
                  Mobile
                </label>
                <input
                  type="text"
                  value={customerMobile}
                  onChange={(e) => setCustomerMobile(e.target.value)}
                  placeholder="Mobile"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Fine Gold */}
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '12px', 
                  fontWeight: 600, 
                  color: '#475569', 
                  marginBottom: '4px' 
                }}>
                  Fine Gold
                </label>
                <input
                  type="number"
                  value={fineGold}
                  onChange={(e) => setFineGold(parseFloat(e.target.value || 0).toFixed(3))}
                  step="0.001"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Advance Amount */}
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '12px', 
                  fontWeight: 600, 
                  color: '#475569', 
                  marginBottom: '4px' 
                }}>
                  Advance Amount
                </label>
                <input
                  type="number"
                  value={advanceAmount}
                  onChange={(e) => setAdvanceAmount(parseFloat(e.target.value || 0).toFixed(2))}
                  step="0.01"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Balance Amount */}
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '12px', 
                  fontWeight: 600, 
                  color: '#475569', 
                  marginBottom: '4px' 
                }}>
                  Balance Amount
                </label>
                <input
                  type="number"
                  value={balanceAmount}
                  readOnly
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    background: '#f8fafc',
                    color: '#64748b'
                  }}
                />
              </div>
            </div>
          </div>

          {/* RFID Tray Scanning Section - Collapsible */}
          <div style={{
            background: '#ffffff',
            borderRadius: '8px',
            padding: isSmallScreen ? '10px 12px' : '12px 16px',
            marginBottom: '12px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
            border: '1px solid #e5e7eb'
          }}>
            {/* Section Header - Collapsible */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: isRfidTrayCollapsed ? '0' : '12px',
              flexWrap: 'wrap',
              gap: '8px',
              cursor: 'pointer',
              padding: '8px',
              margin: '-8px',
              borderRadius: '6px',
              transition: 'background 0.2s'
            }}
            onClick={() => setIsRfidTrayCollapsed(!isRfidTrayCollapsed)}
            onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isRfidTrayCollapsed ? (
                  <FaChevronDown style={{ fontSize: '12px', color: '#64748b' }} />
                ) : (
                  <FaChevronUp style={{ fontSize: '12px', color: '#64748b' }} />
                )}
                <h3 style={{
                  margin: 0,
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#1e293b'
                }}>
                  RFID Tray Scanning
                  {rfidTags.length > 0 && (
                    <span style={{
                      marginLeft: '8px',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#64748b'
                    }}>
                      ({rfidTags.length} tags)
                    </span>
                  )}
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {rfidTags.length > 0 && (
                  <span style={{
                    fontSize: '12px',
                    color: '#64748b',
                    fontWeight: 600
                  }}>
                    {rfidTags.length} tags
                  </span>
                )}
                {!isRfidTrayCollapsed && rfidTags.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      clearRfidTray();
                    }}
                    style={{
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      border: '1px solid #ef4444',
                      borderRadius: '6px',
                      background: '#ffffff',
                      color: '#ef4444',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#ef4444';
                      e.currentTarget.style.color = '#ffffff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#ffffff';
                      e.currentTarget.style.color = '#ef4444';
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Collapsible Content */}
            {!isRfidTrayCollapsed && (
              <div style={{
                marginTop: '12px'
              }}>

            {/* RFID Tray Input Box with Buttons Side by Side */}
            <div style={{
              position: 'relative',
              marginBottom: '16px'
            }}>
              {/* Input and Buttons in One Line */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: isSmallScreen ? '8px' : '12px',
                flexWrap: isSmallScreen ? 'wrap' : 'nowrap',
                marginBottom: '12px'
              }}>
                {/* Input Field with Icon */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flex: isSmallScreen ? '1 1 100%' : '1 1 auto',
                  minWidth: isSmallScreen ? '100%' : '200px'
                }}>
                  <FaBox style={{
                    color: '#94a3b8',
                    fontSize: '16px',
                    flexShrink: 0
                  }} />
                  <input
                    type="text"
                    value={rfidTrayInput}
                    onChange={handleRfidTrayChange}
                    placeholder="Add Product in RFID Tray"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: isSmallScreen ? '12px' : '13px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      outline: 'none',
                      transition: 'all 0.2s',
                      fontFamily: 'monospace'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                    onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                  />
                </div>
                
                {/* Action Buttons */}
                <div style={{
                  display: 'flex',
                  gap: isSmallScreen ? '8px' : '10px',
                  flexShrink: 0,
                  width: isSmallScreen ? '100%' : 'auto',
                  flexWrap: 'wrap'
                }}>
                  {/* File Watcher Controls */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!watchEnabled || watcherStatus === 'paused' || watcherStatus === 'idle') {
                        handleStartWatcher();
                      } else if (isScanning) {
                        handleStopWatcher();
                      } else {
                        handleStartWatcher();
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: isSmallScreen ? '8px 12px' : '8px 16px',
                      fontSize: isSmallScreen ? '11px' : '12px',
                      fontWeight: 600,
                      borderRadius: '6px',
                      border: '1px solid',
                      background: isScanning ? '#10b981' : '#627282',
                      color: '#ffffff',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      whiteSpace: 'nowrap',
                      flex: isSmallScreen ? '1' : 'none'
                    }}
                    title="Start/Stop File Watcher (C:\\loyalstring\\MyScans)"
                  >
                    <BsUpcScan size={16} />
                    {isScanning ? 'Stop' : 'Start'}
                  </button>
                  
                  <button
                    onClick={resetRfidTray}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: isSmallScreen ? '8px 12px' : '8px 16px',
                      fontSize: isSmallScreen ? '11px' : '12px',
                      fontWeight: 600,
                      border: '1px solid #64748b',
                      borderRadius: '6px',
                      background: '#ffffff',
                      color: '#64748b',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      whiteSpace: 'nowrap',
                      flex: isSmallScreen ? '1' : 'none'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#64748b';
                      e.currentTarget.style.color = '#ffffff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#ffffff';
                      e.currentTarget.style.color = '#64748b';
                    }}
                  >
                    <FaRedo />
                    Reset
                  </button>
                  <button
                  onClick={findStockForRfidTags}
                  disabled={rfidTags.length === 0 || loadingStock}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: isSmallScreen ? '8px 12px' : '8px 16px',
                      fontSize: isSmallScreen ? '11px' : '12px',
                      fontWeight: 600,
                      border: '1px solid #3b82f6',
                      borderRadius: '6px',
                      background: rfidTags.length === 0 || loadingStock ? '#f1f5f9' : '#3b82f6',
                      color: rfidTags.length === 0 || loadingStock ? '#94a3b8' : '#ffffff',
                      cursor: rfidTags.length === 0 || loadingStock ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      whiteSpace: 'nowrap',
                      flex: isSmallScreen ? '1' : 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (rfidTags.length > 0 && !loadingStock) {
                        e.currentTarget.style.background = '#2563eb';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (rfidTags.length > 0 && !loadingStock) {
                        e.currentTarget.style.background = '#3b82f6';
                      }
                    }}
                  >
                    <FaDatabase />
                    Find Stock
                  </button>
                  
                  {/* Status Indicator */}
                  {isScanning && (
                    <span style={{
                      fontSize: isSmallScreen ? '10px' : '11px',
                      color: '#10b981',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '6px 10px',
                      background: '#f0fdf4',
                      borderRadius: '6px',
                      border: '1px solid #10b981'
                    }}>
                      <span style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: '#10b981',
                        animation: 'pulse 2s infinite'
                      }}></span>
                      Scanning...
                    </span>
                  )}
                  
                  {/* Scan Date Display */}
                  {scannedDate && (
                    <span style={{
                      fontSize: isSmallScreen ? '10px' : '11px',
                      color: '#64748b',
                      fontWeight: 500,
                      padding: '6px 10px',
                      background: '#f8fafc',
                      borderRadius: '6px'
                    }}>
                      Date: {scannedDate}
                    </span>
                  )}
                </div>
              </div>
              
              {/* Description Text */}
              <p style={{
                margin: '0 0 0 24px',
                fontSize: isSmallScreen ? '11px' : '12px',
                color: '#64748b',
                lineHeight: '1.5'
              }}>
                Paste the continuous RFID string from the tray scanner. Each RFID tag is 24 characters long. The system will automatically parse and separate all tags.
              </p>
            </div>

            {/* RFID Tags Table - 4 Columns */}
            {rfidTags.length > 0 && (
              <div style={{
                marginTop: '16px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                overflow: 'hidden'
              }}>
                {/* Table Header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  background: '#f8fafc',
                  borderBottom: '2px solid #e2e8f0'
                }}>
                  {[1, 2, 3, 4].map((colNum) => (
                    <div
                      key={colNum}
                      style={{
                        padding: '10px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#475569',
                        textAlign: 'center',
                        borderRight: colNum < 4 ? '1px solid #e2e8f0' : 'none'
                      }}
                    >
                      Column {colNum}
                    </div>
                  ))}
                </div>
                
                {/* Table Body - Row by Row Display */}
                <div style={{
                  maxHeight: '500px',
                  overflowY: 'auto'
                }}>
                  {Array.from({ length: maxRows }).map((_, rowIndex) => (
                    <div
                      key={rowIndex}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        borderBottom: rowIndex < maxRows - 1 ? '1px solid #f1f5f9' : 'none',
                        backgroundColor: rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc'
                      }}
                    >
                      {tagColumns.map((column, colIndex) => {
                        const item = column[rowIndex];
                        return (
                          <div
                            key={colIndex}
                            style={{
                              padding: '10px 12px',
                              borderRight: colIndex < 3 ? '1px solid #f1f5f9' : 'none',
                              minHeight: '60px',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center'
                            }}
                          >
                            {item ? (
                              <>
                                <div style={{
                                  marginBottom: '6px',
                                  fontSize: '10px',
                                  color: '#64748b',
                                  fontWeight: 600
                                }}>
                                  #{item.index}
                                </div>
                                <div style={{
                                  fontSize: '11px',
                                  fontFamily: 'monospace',
                                  color: '#1e293b',
                                  wordBreak: 'break-all',
                                  lineHeight: '1.4'
                                }}>
                                  {item.tag}
                                </div>
                              </>
                            ) : (
                              <div style={{
                                fontSize: '11px',
                                color: '#cbd5e1',
                                fontStyle: 'italic',
                                textAlign: 'center'
                              }}>
                                -
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
                
                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    background: '#f8fafc',
                    borderTop: '1px solid #e2e8f0',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}>
                    <div style={{
                      fontSize: '12px',
                      color: '#64748b',
                      fontWeight: 500
                    }}>
                      Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, rfidTags.length)} of {rfidTags.length} tags
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: 600,
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          background: currentPage === 1 ? '#f1f5f9' : '#ffffff',
                          color: currentPage === 1 ? '#94a3b8' : '#475569',
                          cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (currentPage > 1) {
                            e.currentTarget.style.background = '#f1f5f9';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (currentPage > 1) {
                            e.currentTarget.style.background = '#ffffff';
                          }
                        }}
                      >
                        <FaChevronLeft />
                        Previous
                      </button>
                      
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }
                          
                          return (
                            <button
                              key={pageNum}
                              onClick={() => handlePageChange(pageNum)}
                              style={{
                                minWidth: '32px',
                                padding: '6px 8px',
                                fontSize: '12px',
                                fontWeight: pageNum === currentPage ? 700 : 500,
                                border: '1px solid #e2e8f0',
                                borderRadius: '6px',
                                background: pageNum === currentPage ? '#3b82f6' : '#ffffff',
                                color: pageNum === currentPage ? '#ffffff' : '#475569',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                if (pageNum !== currentPage) {
                                  e.currentTarget.style.background = '#f1f5f9';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (pageNum !== currentPage) {
                                  e.currentTarget.style.background = '#ffffff';
                                }
                              }}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                      </div>
                      
                      <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: 600,
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          background: currentPage === totalPages ? '#f1f5f9' : '#ffffff',
                          color: currentPage === totalPages ? '#94a3b8' : '#475569',
                          cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (currentPage < totalPages) {
                            e.currentTarget.style.background = '#f1f5f9';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (currentPage < totalPages) {
                            e.currentTarget.style.background = '#ffffff';
                          }
                        }}
                      >
                        Next
                        <FaChevronRight />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Empty State */}
            {rfidTags.length === 0 && (
              <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: '#94a3b8'
              }}>
                <FaBox style={{ fontSize: '48px', marginBottom: '12px' }} />
                <p style={{
                  fontSize: '14px',
                  margin: 0
                }}>
                  Paste RFID tray string above to scan and display tags
                </p>
              </div>
            )}
              </div>
            )}
          </div>

          {/* Stock Products Display Section */}
          {stockData.length > 0 && (
            <div style={{
              background: '#ffffff',
              borderRadius: '8px',
              padding: isSmallScreen ? '10px 12px' : '12px 16px',
              marginBottom: '12px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              border: '1px solid #e5e7eb'
            }}>
              {/* Section Header */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
                flexWrap: 'wrap',
                gap: '8px'
              }}>
                <h3 style={{
                  margin: 0,
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#1e293b'
                }}>
                  Stock Products ({stockData.length})
                </h3>
              </div>

              {/* REMOVED: Create Quotation from All Button - This functionality has been removed per requirements */}

              {/* Products Grid - Reduced height for many products */}
              {(() => {
                const startIndex = (stockCurrentPage - 1) * stockItemsPerPage;
                const endIndex = startIndex + stockItemsPerPage;
                const paginatedProducts = stockData.slice(startIndex, endIndex);
                const stockTotalPages = Math.ceil(stockData.length / stockItemsPerPage);

                return (
                  <>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: isSmallScreen 
                        ? '1fr' 
                        : windowWidth <= 768
                          ? 'repeat(2, 1fr)'
                          : windowWidth <= 1024 
                            ? 'repeat(3, 1fr)' 
                            : windowWidth <= 1400
                              ? 'repeat(4, 1fr)'
                              : 'repeat(5, 1fr)',
                      gap: isSmallScreen ? '10px' : '12px'
                    }}>
                      {paginatedProducts.map((product, index) => {
                        const globalIndex = startIndex + index;
                        
                        return (
                          <div
                            key={globalIndex}
                            style={{
                              background: '#ffffff',
                              borderRadius: '8px',
                              border: '1px solid #e2e8f0',
                              overflow: 'hidden',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                              e.currentTarget.style.transform = 'translateY(-2px)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                              e.currentTarget.style.transform = 'translateY(0)';
                            }}
                          >

                            {/* Image Section - 60% - Reduced Height */}
                            <div style={{
                              width: '100%',
                              height: isSmallScreen ? '120px' : stockData.length > 50 ? '140px' : '160px',
                      background: '#f8fafc',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      position: 'relative'
                    }}>
                      {(() => {
                        let imageUrl = null;
                        if (product.Images) {
                          if (Array.isArray(product.Images) && product.Images.length > 0) {
                            imageUrl = product.Images[0];
                          } else if (typeof product.Images === 'string' && product.Images.trim() !== '') {
                            imageUrl = product.Images;
                          }
                        }
                        
                        return imageUrl ? (
                          <>
                            <img
                              src={imageUrl}
                              alt={product.ItemCode || 'Product'}
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover'
                              }}
                              onError={(e) => {
                                e.target.style.display = 'none';
                                if (e.target.nextSibling) {
                                  e.target.nextSibling.style.display = 'flex';
                                }
                              }}
                            />
                            <div style={{
                              display: 'none',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '100%',
                              height: '100%',
                              background: '#f1f5f9',
                              color: '#94a3b8',
                              fontSize: isSmallScreen ? '14px' : '16px',
                              fontWeight: 500
                            }}>
                              <FaBox style={{ fontSize: '48px' }} />
                            </div>
                          </>
                        ) : (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '100%',
                            height: '100%',
                            background: '#f1f5f9',
                            color: '#94a3b8',
                            fontSize: isSmallScreen ? '14px' : '16px',
                            fontWeight: 500
                          }}>
                            <FaBox style={{ fontSize: '48px' }} />
                          </div>
                        );
                      })()}
                    </div>

                    {/* Product Details Section - 40% */}
                    <div style={{
                      padding: isSmallScreen ? '10px' : '12px'
                    }}>
                      {/* Item Code */}
                      {product.ItemCode && (
                        <div style={{ marginBottom: '6px' }}>
                          <span style={{
                            fontSize: '10px',
                            color: '#64748b',
                            fontWeight: 600
                          }}>Item Code:</span>
                          <span style={{
                            fontSize: '12px',
                            color: '#1e293b',
                            fontWeight: 600,
                            marginLeft: '4px'
                          }}>{product.ItemCode}</span>
                        </div>
                      )}

                      {/* RFID */}
                      {product.TIDNumber && (
                        <div style={{ marginBottom: '6px' }}>
                          <span style={{
                            fontSize: '10px',
                            color: '#64748b',
                            fontWeight: 600
                          }}>RFID:</span>
                          <span style={{
                            fontSize: '11px',
                            color: '#475569',
                            fontFamily: 'monospace',
                            marginLeft: '4px',
                            wordBreak: 'break-all'
                          }}>{product.TIDNumber}</span>
                        </div>
                      )}

                      {/* Category */}
                      {product.CategoryName && (
                        <div style={{ marginBottom: '6px' }}>
                          <span style={{
                            fontSize: '10px',
                            color: '#64748b',
                            fontWeight: 600
                          }}>Category:</span>
                          <span style={{
                            fontSize: '11px',
                            color: '#475569',
                            marginLeft: '4px'
                          }}>{product.CategoryName}</span>
                        </div>
                      )}

                      {/* Product Name */}
                      {product.ProductName && (
                        <div style={{ marginBottom: '6px' }}>
                          <span style={{
                            fontSize: '10px',
                            color: '#64748b',
                            fontWeight: 600
                          }}>Product:</span>
                          <span style={{
                            fontSize: '11px',
                            color: '#475569',
                            marginLeft: '4px'
                          }}>{product.ProductName}</span>
                        </div>
                      )}

                      {/* Design */}
                      {product.DesignName && (
                        <div style={{ marginBottom: '6px' }}>
                          <span style={{
                            fontSize: '10px',
                            color: '#64748b',
                            fontWeight: 600
                          }}>Design:</span>
                          <span style={{
                            fontSize: '11px',
                            color: '#475569',
                            marginLeft: '4px'
                          }}>{product.DesignName}</span>
                        </div>
                      )}

                      {/* Purity */}
                      {product.PurityName && (
                        <div style={{ marginBottom: '6px' }}>
                          <span style={{
                            fontSize: '10px',
                            color: '#64748b',
                            fontWeight: 600
                          }}>Purity:</span>
                          <span style={{
                            fontSize: '11px',
                            color: '#475569',
                            marginLeft: '4px'
                          }}>{product.PurityName}</span>
                        </div>
                      )}

                      {/* Gross Weight */}
                      {product.GrossWt && (
                        <div style={{ marginBottom: '6px' }}>
                          <span style={{
                            fontSize: '10px',
                            color: '#64748b',
                            fontWeight: 600
                          }}>Gross Wt:</span>
                          <span style={{
                            fontSize: '11px',
                            color: '#475569',
                            marginLeft: '4px'
                          }}>{product.GrossWt} g</span>
                        </div>
                      )}

                      {/* Net Weight */}
                      {product.NetWt && (
                        <div style={{ marginBottom: '0' }}>
                          <span style={{
                            fontSize: '10px',
                            color: '#64748b',
                            fontWeight: 600
                          }}>Net Wt:</span>
                          <span style={{
                            fontSize: '11px',
                            color: '#475569',
                            marginLeft: '4px'
                          }}>{product.NetWt} g</span>
                        </div>
                      )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Stock Products Pagination */}
                  {stockTotalPages > 1 && (
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 16px',
                      background: '#f8fafc',
                      borderTop: '1px solid #e2e8f0',
                      marginTop: '16px',
                      borderRadius: '0 0 8px 8px',
                      flexWrap: 'wrap',
                      gap: '10px'
                    }}>
                      <div style={{
                        fontSize: '12px',
                        color: '#64748b',
                        fontWeight: 500
                      }}>
                        Showing {startIndex + 1} to {Math.min(endIndex, stockData.length)} of {stockData.length} products
                      </div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        <button
                          onClick={() => setStockCurrentPage(Math.max(1, stockCurrentPage - 1))}
                          disabled={stockCurrentPage === 1}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                            background: stockCurrentPage === 1 ? '#f1f5f9' : '#ffffff',
                            color: stockCurrentPage === 1 ? '#94a3b8' : '#475569',
                            cursor: stockCurrentPage === 1 ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          <FaChevronLeft />
                          Previous
                        </button>
                        
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          {Array.from({ length: Math.min(5, stockTotalPages) }, (_, i) => {
                            let pageNum;
                            if (stockTotalPages <= 5) {
                              pageNum = i + 1;
                            } else if (stockCurrentPage <= 3) {
                              pageNum = i + 1;
                            } else if (stockCurrentPage >= stockTotalPages - 2) {
                              pageNum = stockTotalPages - 4 + i;
                            } else {
                              pageNum = stockCurrentPage - 2 + i;
                            }
                            
                            return (
                              <button
                                key={pageNum}
                                onClick={() => setStockCurrentPage(pageNum)}
                                style={{
                                  minWidth: '32px',
                                  padding: '6px 8px',
                                  fontSize: '12px',
                                  fontWeight: pageNum === stockCurrentPage ? 700 : 500,
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '6px',
                                  background: pageNum === stockCurrentPage ? '#3b82f6' : '#ffffff',
                                  color: pageNum === stockCurrentPage ? '#ffffff' : '#475569',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s'
                                }}
                              >
                                {pageNum}
                              </button>
                            );
                          })}
                        </div>
                        
                        <button
                          onClick={() => setStockCurrentPage(Math.min(stockTotalPages, stockCurrentPage + 1))}
                          disabled={stockCurrentPage === stockTotalPages}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                            background: stockCurrentPage === stockTotalPages ? '#f1f5f9' : '#ffffff',
                            color: stockCurrentPage === stockTotalPages ? '#94a3b8' : '#475569',
                            cursor: stockCurrentPage === stockTotalPages ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          Next
                          <FaChevronRight />
                        </button>
                      </div>
                    </div>
                  )}
                  </>
                );
              })()}
            </div>
          )}

          {/* Loading State for Stock */}
          {loadingStock && (
            <div style={{
              background: '#ffffff',
              borderRadius: '8px',
              padding: '40px 20px',
              marginBottom: '12px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              border: '1px solid #e5e7eb',
              textAlign: 'center'
            }}>
              <div style={{
                display: 'inline-block',
                width: '40px',
                height: '40px',
                border: '3px solid #f3f4f6',
                borderTop: '3px solid #3b82f6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                marginBottom: '12px'
              }}></div>
              <p style={{
                fontSize: '14px',
                color: '#64748b',
                margin: 0
              }}>
                Searching for stock...
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Quotation Success Popup Modal */}
      {showQuotationSuccess && quotationSuccessData && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '20px'
        }}
        onClick={() => setShowQuotationSuccess(false)}
        >
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: isSmallScreen ? '24px' : '32px',
            maxWidth: '500px',
            width: '100%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            position: 'relative',
            animation: 'fadeIn 0.3s ease-in'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setShowQuotationSuccess(false)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <FaTimes style={{ color: '#64748b', fontSize: '18px' }} />
            </button>

            {/* Success Icon */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: '20px'
            }}>
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 10px 20px rgba(16, 185, 129, 0.3)'
              }}>
                <FaCheckCircle style={{ color: '#ffffff', fontSize: '48px' }} />
              </div>
            </div>

            {/* Success Message */}
            <h2 style={{
              fontSize: isSmallScreen ? '20px' : '24px',
              fontWeight: 700,
              color: '#1e293b',
              textAlign: 'center',
              margin: '0 0 12px 0'
            }}>
              Quotation Generated Successfully!
            </h2>

            <p style={{
              fontSize: '14px',
              color: '#64748b',
              textAlign: 'center',
              margin: '0 0 24px 0',
              lineHeight: '1.6'
            }}>
              Your quotation has been created and saved successfully.
            </p>

            {/* Quotation Details */}
            <div style={{
              background: '#f8fafc',
              borderRadius: '8px',
              padding: '20px',
              marginBottom: '24px',
              border: '1px solid #e2e8f0'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
                paddingBottom: '12px',
                borderBottom: '1px solid #e2e8f0'
              }}>
                <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Quotation No:</span>
                <span style={{ fontSize: '16px', color: '#1e293b', fontWeight: 700 }}>
                  #{quotationSuccessData.quotationNo}
                </span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
                paddingBottom: '12px',
                borderBottom: '1px solid #e2e8f0'
              }}>
                <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Date:</span>
                <span style={{ fontSize: '14px', color: '#475569', fontWeight: 500 }}>
                  {quotationSuccessData.date}
                </span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
                paddingBottom: '12px',
                borderBottom: '1px solid #e2e8f0'
              }}>
                <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Products:</span>
                <span style={{ fontSize: '14px', color: '#475569', fontWeight: 500 }}>
                  {quotationSuccessData.productCount} {quotationSuccessData.productCount === 1 ? 'Item' : 'Items'}
                </span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Total Amount:</span>
                <span style={{ fontSize: '18px', color: '#10b981', fontWeight: 700 }}>
                  ₹{parseFloat(quotationSuccessData.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{
              display: 'flex',
              gap: '12px',
              flexWrap: 'wrap'
            }}>
              <button
                onClick={() => {
                  setShowQuotationSuccess(false);
                  navigate('/quotation');
                }}
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  fontSize: '14px',
                  fontWeight: 600,
                  border: '1px solid #3b82f6',
                  borderRadius: '8px',
                  background: '#3b82f6',
                  color: '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  minWidth: '120px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#2563eb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#3b82f6';
                }}
              >
                View Quotation
              </button>
              <button
                onClick={() => {
                  setShowQuotationSuccess(false);
                  clearRfidTray();
                }}
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  fontSize: '14px',
                  fontWeight: 600,
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  background: '#ffffff',
                  color: '#475569',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  minWidth: '120px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f8fafc';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#ffffff';
                }}
              >
                Create New
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
};

export default QuotationWithRFIDTray;

