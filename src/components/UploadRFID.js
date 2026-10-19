// UploadRFID.js - RFID Excel uploader for /upload-rfid route
// Modified to read Excel files and send all data in single payload
import React, { useRef, useState, useEffect } from 'react';
import { FaCloudUploadAlt, FaFileExcel, FaTimes, FaCheckCircle, FaDownload, FaSpinner, FaTrash } from 'react-icons/fa';
import * as XLSX from 'xlsx';
import { toRrgoldApiUrl } from '../services/apiBaseConfig';
import PageHeader from './common/PageHeader';

const API_URL = toRrgoldApiUrl('/api/Device/BulkUploadRFIDData');

const UploadRFID = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState('');
  const [processedData, setProcessedData] = useState(null);
  const [totalRecords, setTotalRecords] = useState(0);
  const [currentRecord, setCurrentRecord] = useState(0);
  const fileInputRef = useRef(null);
  const [userInfo, setUserInfo] = useState(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  
  // Get clientCode and userInfo from localStorage
  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('userInfo'));
      setUserInfo(user);
    } catch (err) {
      console.error('Error parsing userInfo:', err);
    }
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const validateAndSetFile = (file) => {
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      setSelectedFile(file);
      setError('');
      setSuccess(null);
      setProcessedData(null);
      setTotalRecords(0);
      setCurrentRecord(0);
      // Read and process the file immediately
      processExcelFile(file);
    } else {
      setError('Please select a valid Excel file (.xlsx or .xls)');
      setSelectedFile(null);
    }
  };

  const processExcelFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON array (no headers, just raw data)
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        
        if (jsonData.length < 1) {
          setError('Excel file must contain at least one data row');
          setSelectedFile(null);
          return;
        }

        // Process data rows - Column 0: BarcodeNumber, Column 1: TidValue
        const processedRows = jsonData
          .map((row, index) => {
            // Skip empty rows
            if (!row || row.length === 0 || (!row[0] && !row[1])) {
              return null;
            }
            
            return {
              BarcodeNumber: row[0] ? String(row[0]).trim() : '',
              TidValue: row[1] ? String(row[1]).trim() : ''
            };
          })
          .filter(row => {
            // Filter out null rows and rows with missing required data
            return row && row.BarcodeNumber && row.TidValue;
          });

        if (processedRows.length === 0) {
          setError('No valid data found. Ensure Column 0 contains BarcodeNumber and Column 1 contains TidValue');
          setSelectedFile(null);
          return;
        }

        setProcessedData(processedRows);
        setTotalRecords(processedRows.length);
        console.log(`Processed ${processedRows.length} records from Excel file`);
        
      } catch (err) {
        console.error('Error processing Excel file:', err);
        setError('Error processing Excel file. Please check the file format.');
        setSelectedFile(null);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  // Ensure Browse files button always opens the file picker
  const handleBrowseClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.disabled = false; // Ensure not disabled
      fileInputRef.current.click();
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setUploadProgress(0);
    setSuccess(null);
    setError('');
    setProcessedData(null);
    setTotalRecords(0);
    setCurrentRecord(0);
    setUploadResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadFile = async () => {
    if (!selectedFile || !userInfo?.ClientCode) {
      setError('Unable to upload: ' + (!selectedFile ? 'No file selected.' : 'No client code found.'));
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setError('');
    setSuccess(null);
    setShowSuccessModal(false);

    try {
      // Create FormData to send file and ClientCode
      // API expects: Form field: ClientCode, Form file: Excel file
      const formData = new FormData();
      formData.append('ClientCode', userInfo.ClientCode);
      formData.append('file', selectedFile);

      console.log(`Uploading file: ${selectedFile.name} for client: ${userInfo.ClientCode}`);
      
      // Create XMLHttpRequest to track upload progress
      const xhr = new XMLHttpRequest();
      
      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progress);
        }
      });

      // Handle response
      xhr.addEventListener('load', () => {
        if (xhr.status === 200 || xhr.status === 201) {
          try {
            const result = JSON.parse(xhr.responseText);
            // API returns detailed response with statistics
            const message = result.message || `File uploaded successfully!`;
            const stats = result.statistics || {};
            const inserted = stats.inserted || stats.insertedCount || 0;
            const updated = stats.updated || stats.updatedCount || 0;
            const total = stats.total || stats.totalCount || totalRecords;
            
            let successMessage = message;
            if (inserted > 0 || updated > 0) {
              successMessage += ` (${inserted} inserted, ${updated} updated)`;
            } else if (total > 0) {
              successMessage += ` (${total} records processed)`;
            }
            
            // Store result for modal display
            setUploadResult({
              message: successMessage,
              statistics: {
                inserted,
                updated,
                total: total || totalRecords
              },
              fullResponse: result
            });
            
            setSuccess(successMessage);
            setShowSuccessModal(true);
            handleRemoveFile();
          } catch (err) {
            // If response is not JSON, still show success
            setSuccess(`File uploaded successfully! ${totalRecords} records processed.`);
            setShowSuccessModal(true);
            handleRemoveFile();
          }
        } else {
          // Non-success status: show error and let the user retry or remove the file.
          let errorMessage = `Upload failed with status: ${xhr.status}`;
          try {
            if (xhr.responseText) {
              const errorData = JSON.parse(xhr.responseText);
              errorMessage = errorData.message || errorData.error || errorMessage;
            }
          } catch (e) {
            // If response is not JSON, use default message
          }
          setError('Upload failed: ' + errorMessage + '. Please try again or remove the file and upload a new one.');
          setUploadProgress(0);
        }
        setUploading(false);
      });

      // Handle network errors
      xhr.addEventListener('error', () => {
        setError('Network error occurred during upload. Please try again or remove the file and upload a new one.');
        setUploadProgress(0);
        setUploading(false);
      });

      // Handle timeout
      xhr.addEventListener('timeout', () => {
        setError('Upload timed out. Please try again or remove the file and upload a new one.');
        setUploadProgress(0);
        setUploading(false);
      });

      // Handle user/programmatic abort
      xhr.addEventListener('abort', () => {
        setError('Upload was cancelled. Please try again or remove the file and upload a new one.');
        setUploadProgress(0);
        setUploading(false);
      });

      // Open and send request
      xhr.timeout = 120000; // 2 minutes safety timeout so it never spins forever
      xhr.open('POST', API_URL);
      xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('token')}`);
      xhr.send(formData);

    } catch (err) {
      console.error('Upload error:', err);
      setError('Upload failed: ' + err.message);
      setUploading(false);
    }
  };

  // Download Excel Template Function
  // Template format: Column 0 = BarcodeNumber, Column 1 = TidValue
  const downloadTemplate = () => {
    // Create template data as array of arrays (no headers)
    // Column 0: BarcodeNumber, Column 1: TidValue
    const templateData = [
      ['RJ0001', 'E280119120006013217D032D'],
      ['RJ0002', 'E2801191200065A721B7032D'],
      ['RJ0003', 'E280119120006013217D032E']
    ];

    // Create worksheet from array of arrays
    const worksheet = XLSX.utils.aoa_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'RFID Template');
    
    // Set column widths
    const wscols = [
      { wch: 15 }, // Column 0: BarcodeNumber
      { wch: 30 }  // Column 1: TidValue
    ];
    worksheet['!cols'] = wscols;

    const filename = 'Upload RFID Template.xlsx';
    XLSX.writeFile(workbook, filename);
  };

  return (
    <div className="bulk-rfid-page" style={{ fontFamily: 'var(--font-family)', background: '#ffffff', padding: 0, minHeight: '100%' }}>
      <style>{`
        .bulk-rfid-page {
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-height: 0;
        }
        .bulk-rfid-page * { box-sizing: border-box; }
        .bulk-stage {
          flex: 1 1 auto;
          min-height: 280px;
          display: grid;
          grid-template-columns: minmax(0, 1.35fr) minmax(240px, 0.75fr);
          gap: 12px;
          align-items: stretch;
        }
        .bulk-drop {
          border: 1.5px dashed #b7ddd8;
          border-radius: 16px;
          background-color: #f7fbfb;
          background-image: radial-gradient(#d5ebe7 1.1px, transparent 1.1px);
          background-size: 18px 18px;
          min-height: 280px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 28px 20px;
          text-align: center;
          cursor: pointer;
          transition: border-color 0.15s ease, background-color 0.15s ease, transform 0.15s ease;
        }
        .bulk-drop:hover,
        .bulk-drop.is-drag {
          border-color: #0f766e;
          background-color: #f0fdfa;
        }
        .bulk-drop h3 { margin: 0 0 6px; font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.03em; }
        .bulk-drop p { margin: 0; font-size: 12px; color: #64748b; font-weight: 600; line-height: 1.45; }
        .bulk-icon {
          width: 64px;
          height: 64px;
          margin: 0 auto 14px;
          border-radius: 18px;
          border: 1px solid #c7ebe4;
          background: #fff;
          color: #0f766e;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 26px;
          box-shadow: 0 8px 20px rgba(15, 118, 110, 0.08);
        }
        .bulk-go {
          height: 36px;
          padding: 0 16px;
          border: none;
          border-radius: 8px;
          background: #0f766e;
          color: #fff;
          font-size: 12px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
        }
        .bulk-go:hover { background: #115e59; }
        .bulk-go:disabled { opacity: 0.5; cursor: not-allowed; }
        .bulk-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-top: 16px; }
        .bulk-side {
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-width: 0;
        }
        .bulk-sheet, .bulk-steps {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          overflow: hidden;
        }
        .bulk-sheet { flex: 1 1 auto; }
        .bulk-sheet-bar, .bulk-steps h4 {
          margin: 0;
          padding: 10px 12px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #0f766e;
          background: #f0fdfa;
          border-bottom: 1px solid #d5ebe7;
        }
        .bulk-sheet-row {
          display: grid;
          grid-template-columns: 0.7fr 1.3fr;
          gap: 8px;
          padding: 9px 12px;
          font-size: 12px;
          color: #334155;
          border-bottom: 1px solid #f1f5f9;
          font-variant-numeric: tabular-nums;
        }
        .bulk-sheet-row:last-child { border-bottom: none; }
        .bulk-sheet-row.is-head {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #64748b;
          background: #f8fafc;
        }
        .bulk-sheet-row span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .bulk-steps { padding-bottom: 4px; }
        .bulk-steps ol { margin: 0; padding: 10px 12px 12px 32px; display: flex; flex-direction: column; gap: 8px; }
        .bulk-steps li { font-size: 12px; font-weight: 650; color: #334155; }
        .bulk-note {
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #fff;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 600;
        }
        .bulk-note.is-error { border-color: #fecaca; background: #fef2f2; color: #b91c1c; }
        .bulk-note.is-ok { border-color: #bbf7d0; background: #f0fdf4; color: #166534; }
        .bulk-rfid-page .page-lot { max-width: 100%; }
        .bulk-rfid-page .page-lot strong {
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 220px;
        }
        .bulk-progress { margin-top: 14px; text-align: left; }
        .bulk-progress-track { height: 6px; background: #e2e8f0; border-radius: 999px; overflow: hidden; }
        .bulk-progress-bar { height: 100%; background: #0f766e; }
        @media (max-width: 860px) {
          .bulk-stage { grid-template-columns: 1fr; }
          .bulk-drop { min-height: 220px; }
        }
        @media (max-width: 560px) {
          .bulk-drop { padding: 22px 14px; }
          .bulk-drop h3 { font-size: 17px; }
          .bulk-actions, .bulk-go { width: 100%; }
        }
      `}</style>

      <div className="page-top">
        <div className="page-top-inner">
          <PageHeader
            title="Bulk RFID Upload"
            subtitle="Upload an Excel sheet of barcode and TID values in one batch."
            barStyle={{ padding: 0, margin: 0, gap: 10, borderBottom: 'none' }}
            actions={(
              <button type="button" className="page-chip" onClick={downloadTemplate}>
                <FaDownload /> Download template
              </button>
            )}
          />
          {selectedFile ? (
            <div className="page-toolbar">
              <span className="page-lot">
                File
                <strong>{selectedFile.name}</strong>
              </span>
              <span className="page-lot">
                Records
                <strong>{totalRecords.toLocaleString()}</strong>
              </span>
              <div className="page-toolbar-actions">
                <button type="button" className="bulk-go" onClick={uploadFile} disabled={uploading || !processedData}>
                  {uploading ? <FaSpinner className="fa-spin" /> : <FaCloudUploadAlt />}
                  {uploading ? 'Uploading' : 'Upload file'}
                </button>
                <button type="button" className="page-chip is-danger" onClick={handleRemoveFile} disabled={uploading}>
                  <FaTrash /> Remove
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="bulk-stage">
        <div
          className={`bulk-drop${dragActive ? ' is-drag' : ''}`}
          onClick={() => { if (!uploading) handleBrowseClick(); }}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          {selectedFile ? (
            <div style={{ width: '100%', maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
              <div className="bulk-icon"><FaFileExcel /></div>
              <h3>{selectedFile.name}</h3>
              <p>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB · {totalRecords.toLocaleString()} records ready</p>
              {uploading ? (
                <div className="bulk-progress">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                    <span>Progress</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="bulk-progress-track">
                    <div className="bulk-progress-bar" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              ) : (
                <p style={{ marginTop: 10 }}>Drop another sheet on this card to replace it.</p>
              )}
            </div>
          ) : (
            <div>
              <div className="bulk-icon"><FaCloudUploadAlt /></div>
              <h3>Drop the Excel file here</h3>
              <p>Or click anywhere in this card. Barcode first, TID second.</p>
              <div className="bulk-actions">
                <button
                  type="button"
                  className="bulk-go"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBrowseClick();
                  }}
                >
                  <FaCloudUploadAlt /> Browse files
                </button>
              </div>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>

        <aside className="bulk-side">
          <div className="bulk-sheet">
            <div className="bulk-sheet-bar">Sheet shape</div>
            <div className="bulk-sheet-row is-head"><span>A · Barcode</span><span>B · TID</span></div>
            <div className="bulk-sheet-row"><span>RJ0001</span><span>E2801191…032D</span></div>
            <div className="bulk-sheet-row"><span>RJ0002</span><span>E2801191…032D</span></div>
            <div className="bulk-sheet-row"><span>RJ0003</span><span>E2801191…032E</span></div>
          </div>
          <div className="bulk-steps">
            <h4>Three steps</h4>
            <ol>
              <li>Download the template from the title bar.</li>
              <li>Paste one barcode and one TID on each row.</li>
              <li>Drop the file here, then upload the batch.</li>
            </ol>
          </div>
        </aside>
      </div>

      {error ? (
        <div className="bulk-note is-error" style={{ marginTop: 12 }}>
          <FaTimes />
          <span>{error}</span>
        </div>
      ) : null}

      {success && !showSuccessModal ? (
        <div className="bulk-note is-ok" style={{ marginTop: 12 }}>
          <FaCheckCircle />
          <span>{success}</span>
        </div>
      ) : null}

      {showSuccessModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setShowSuccessModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 12,
              borderTop: '3px solid #0f766e',
              boxShadow: '0 18px 40px rgba(15, 23, 42, 0.16)',
              padding: 20,
              width: '100%',
              maxWidth: 420,
            }}
          >
            <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Upload successful</h2>
            <p style={{ margin: '0 0 14px', fontSize: 12, color: '#64748b', fontWeight: 600, lineHeight: 1.45 }}>
              {uploadResult?.message || `The sheet was processed. ${totalRecords} records were handled.`}
            </p>
            {uploadResult?.statistics && (uploadResult.statistics.inserted > 0 || uploadResult.statistics.updated > 0) ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                {uploadResult.statistics.inserted > 0 ? (
                  <span className="page-lot">New <strong>+{uploadResult.statistics.inserted}</strong></span>
                ) : null}
                {uploadResult.statistics.updated > 0 ? (
                  <span className="page-lot">Updated <strong>{uploadResult.statistics.updated}</strong></span>
                ) : null}
              </div>
            ) : null}
            <button type="button" className="page-chip is-on" onClick={() => setShowSuccessModal(false)} style={{ width: '100%' }}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadRFID;
