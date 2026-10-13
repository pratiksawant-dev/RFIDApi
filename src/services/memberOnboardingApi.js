import { toRrgoldApiUrl } from './apiBaseConfig';

export const getAddVendorUrl = () => toRrgoldApiUrl('/api/ClientOnboarding/AddVendor');
export const getGetAllVendorUrl = () => toRrgoldApiUrl('/api/ClientOnboarding/GetAllVendor');
export const getGetAllVendorsAltUrl = () => toRrgoldApiUrl('/api/ClientOnboarding/GetAllVendors');
export const getAddEmployeeUrl = () => toRrgoldApiUrl('/api/ClientOnboarding/AddEmployee');
export const getGetAllEmployeeUrl = () => toRrgoldApiUrl('/api/ClientOnboarding/GetAllEmployee');
export const getGetAllBranchMasterUrl = () => toRrgoldApiUrl('/api/ClientOnboarding/GetAllBranchMaster');
export const getGetAllCountersUrl = () => toRrgoldApiUrl('/api/ClientOnboarding/GetAllCounters');

export const normalizeOnboardingList = (data) => {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    return data.data || data.Data || data.items || data.Items || data.result || data.Result || [];
  }
  return [];
};

export const pickCounterMasterName = (row) =>
  String(row?.CounterName ?? row?.counterName ?? row?.Name ?? row?.name ?? '').trim();

export const pickCounterMasterId = (row) =>
  row?.Id ?? row?.id ?? row?.CounterId ?? row?.counterId ?? null;

export const resolveBranchNameById = (branchId, branches = []) => {
  if (branchId == null || branchId === '') return '';
  const hit = (Array.isArray(branches) ? branches : []).find(
    (b) => String(b?.Id ?? b?.id) === String(branchId)
  );
  return String(hit?.BranchName ?? hit?.Name ?? hit?.name ?? '').trim();
};

export const normalizeCounterMasterRow = (row, branches = []) => {
  if (!row || typeof row !== 'object') return null;
  const branchId = row.BranchId ?? row.branchId ?? null;
  const counterName = pickCounterMasterName(row);
  const counterDesc = String(
    row?.CounterDescription ??
      row?.counterDescription ??
      row?.Description ??
      row?.description ??
      ''
  ).trim();
  const counterNumber = String(row?.CounterNumber ?? row?.counterNumber ?? '').trim();
  const branchName =
    String(row?.BranchName ?? row?.branchName ?? '').trim() ||
    resolveBranchNameById(branchId, branches);
  return {
    ...row,
    Id: row.Id ?? row.id,
    CounterName: counterName,
    Name: counterName,
    CounterDescription: counterDesc,
    Description: counterDesc,
    CounterNumber: counterNumber,
    BranchId: branchId,
    BranchName: branchName,
  };
};

export const normalizeCounterMasterRows = (rows, branches = []) =>
  (Array.isArray(rows) ? rows : [])
    .map((row) => normalizeCounterMasterRow(row, branches))
    .filter(Boolean);

export function validateVendorSidebarForm(v) {
  if (!String(v?.vendorName || '').trim()) return 'Vendor Name is required.';
  if (!String(v?.companyName || '').trim()) return 'Company Name is required.';
  if (!String(v?.contactNumber || '').trim()) return 'Contact Number is required.';
  if (!String(v?.country || '').trim()) return 'Country is required.';
  if (!String(v?.state || '').trim()) return 'State is required.';
  const pin = String(v?.pincode || '').trim();
  if (pin && !/^\d{6}$/.test(pin)) return 'Pincode must be 6 digits.';
  return null;
}

export function buildAddVendorPayload(form, clientCode) {
  const v = form;
  return {
    ClientCode: clientCode,
    VendorName: String(v.vendorName || '').trim(),
    CompanyName: String(v.companyName || '').trim(),
    Email: String(v.email || '').trim(),
    ContactNumber: String(v.contactNumber || '').trim(),
    AadharNumber: v.aadharNumber ?? '0',
    PanNumber: String(v.panNumber || '').trim(),
    Remarks: String(v.remarks || '').trim(),
    Street: String(v.street || '').trim(),
    Area: String(v.area || '').trim(),
    Town: String(v.town || '').trim(),
    City: String(v.city || '').trim(),
    Country: v.country,
    State: v.state,
    Pincode: String(v.pincode || '').trim(),
  };
}

export function validateEmployeeSidebarForm(emp) {
  if (!String(emp?.firstName || '').trim()) return 'First Name is required.';
  if (!String(emp?.lastName || '').trim()) return 'Last Name is required.';
  if (!String(emp?.empEmail || '').trim()) return 'Emp Email is required.';
  if (!String(emp?.contactNo || '').trim()) return 'Contact Number is required.';
  if (!String(emp?.streetAddress || '').trim()) return 'Street Address is required.';
  if (!String(emp?.country || '').trim()) return 'Country is required.';
  if (!String(emp?.state || '').trim()) return 'State is required.';
  if (!String(emp?.city || '').trim()) return 'City is required.';
  if (!emp?.branch) return 'Branch is required.';
  if (!emp?.department) return 'Department is required.';
  if (!emp?.counter) return 'Counter is required.';
  if (!emp?.roles) return 'Roles is required.';
  return null;
}

export function buildAddEmployeePayload(form, clientCode) {
  const emp = form;
  return {
    ClientCode: clientCode,
    FirstName: emp.firstName.trim(),
    LastName: emp.lastName.trim(),
    EmployeeEmail: emp.empEmail.trim(),
    ContactNumber: emp.contactNo.trim(),
    StreetAddress: emp.streetAddress.trim(),
    Town: emp.town.trim(),
    Country: emp.country,
    State: emp.state,
    City: emp.city.trim(),
    AadharNumber: emp.aadharNo.trim(),
    PanNumber: emp.panNo.trim(),
    JoiningDate: emp.joiningDate || null,
    DateOfBirth: emp.dob || null,
    Gender: emp.gender || '',
    BranchId: emp.branch || '',
    Department: emp.department || '',
    CounterId: emp.counter || '',
    Roles: emp.roles || '',
    ReportingTo: emp.reportingTo || '',
  };
}
