import React, { useState } from 'react';
import { FaCode, FaBook, FaChevronDown, FaChevronUp } from 'react-icons/fa';

const APIDocumentation = () => {
  const [expandedSections, setExpandedSections] = useState({});

  const toggleSection = (sectionId) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  // Comprehensive list of all APIs used in the dashboard
  const allAPIs = [
    // Product Master APIs
    {
      id: 'save-transaction',
      name: 'Add Stock',
      endpoint: 'SaveRFIDTransactionDetails',
      method: 'POST',
      baseUrl: 'https://soni.loyalstring.co.in/api/ProductMaster',
      description: 'Save one or many RFID transactions. Accepts array payload and returns success/partial/failed with per-item saved/error details.',
      sampleBody: [
        {
          client_code: "LS000365",
          RFIDNumber: "123456",
          itemcode: "22K OR",
          product_code: "PRD001",
          description: "itemsize:2.12, HUIDCode:45857KIKL",
          category_id: "GOLD",
          product_id: "22K G JE12.12P",
          design_id: "KS",
          purity_id: "22k",
          branch_id: "CPC",
          counter_id: "TA",
          vendor_id: "Vendor Name",
          box_details: "Box A",
          box: "Box A",
          packet: "Packet 1",
          grosswt: "0",
          stonewt: "0",
          stoneamount: "0.00",
          diamondWeight: "0",
          diamondAmount: "0.00",
          netwt: "0",
          imageurl: "",
          status: "ApiActive",
          HallmarkAmount: "0.00",
          MakingPerGram: "125.00",
          MakingPercentage: "0.00",
          MakingFixedAmt: "0.00",
          MRP: "0.000",
          Stones: [],
          Diamonds: []
        }
      ],
      responseFormat: {
        status: "success|partial|failed",
        message: "string",
        totalItems: 1,
        successfulItems: 1,
        failedItems: 0,
        saved: [
          {
            itemIndex: 1,
            itemcode: "22K OR",
            rfidNumber: "123456",
            labelledStockId: 101,
            branchId: 1,
            counterId: 2
          }
        ],
        errors: []
      }
    },
    {
      id: 'get-saved-rfid-product-details',
      name: 'Get Saved RFID Product Details',
      endpoint: 'GetSavedRFIDProductDetails',
      method: 'POST',
      baseUrl: 'https://soni.loyalstring.co.in/api/ProductMaster',
      description: 'Get one saved RFID product by itemCode or rfidNo. Bearer token is required and clientCode is validated from JWT token.',
      sampleBody: {
        clientCode: "LS000123",
        itemCode: "ITM12345",
        rfidNo: "RFID998877",
        status: "ApiActive"
      },
      responseFormat: {
        success: {
          status: "success",
          message: "Product details retrieved successfully.",
          data: {
            client_code: "LS000123",
            itemcode: "ITM12345",
            RFIDNumber: "RFID998877",
            product_code: "PRD001",
            status: "ApiActive",
            description: "Gold ring",
            category_id: "Rings",
            product_id: "Ladies Ring",
            design_id: "Floral",
            purity_id: "22K",
            branch_id: "Main Branch",
            branch_name: "Main Branch",
            counter_id: "Counter 1",
            counter_name: "Counter 1",
            vendor_id: "Vendor A",
            box_details: "BOX-12",
            box_name: "BOX-12",
            packet: "PACK-1",
            grosswt: "10.250",
            stonewt: "0.500",
            stoneamount: "2500",
            diamondWeight: "0.100",
            diamondAmount: "3000",
            netwt: "9.650",
            imageurl: "org/ProductImage/file.jpg",
            tid_value: "TID12345",
            HallmarkAmount: "200",
            MakingPerGram: "500",
            MakingPercentage: "12",
            MakingFixedAmt: "1000",
            MRP: "75000",
            created_datetime: "2026-04-17T08:35:12.123Z",
            updated_datetime: "2026-04-17T09:10:45.567Z"
          }
        },
        failed: {
          status: "failed",
          message: "No product found for provided filters."
        }
      }
    },
    {
      id: 'get-saved-rfid-product-details',
      name: 'Get Saved RFID Product Details',
      endpoint: 'GetSavedRFIDProductDetails',
      method: 'POST',
      baseUrl: 'https://soni.loyalstring.co.in/api/ProductMaster',
      description: 'Get one saved RFID product by itemCode or rfidNo. Bearer token is required and clientCode is validated from JWT token.',
      sampleBody: {
        clientCode: "LS000123",
        itemCode: "ITM12345",
        rfidNo: "RFID998877",
        status: "ApiActive"
      },
      responseFormat: {
        success: {
          status: "success",
          message: "Product details retrieved successfully.",
          data: {
            client_code: "LS000123",
            itemcode: "ITM12345",
            RFIDNumber: "RFID998877",
            product_code: "PRD001",
            status: "ApiActive",
            description: "Gold ring",
            category_id: "Rings",
            product_id: "Ladies Ring",
            design_id: "Floral",
            purity_id: "22K",
            branch_id: "Main Branch",
            branch_name: "Main Branch",
            counter_id: "Counter 1",
            counter_name: "Counter 1",
            vendor_id: "Vendor A",
            box_details: "BOX-12",
            box_name: "BOX-12",
            packet: "PACK-1",
            grosswt: "10.250",
            stonewt: "0.500",
            stoneamount: "2500",
            diamondWeight: "0.100",
            diamondAmount: "3000",
            netwt: "9.650",
            imageurl: "org/ProductImage/file.jpg",
            tid_value: "TID12345",
            HallmarkAmount: "200",
            MakingPerGram: "500",
            MakingPercentage: "12",
            MakingFixedAmt: "1000",
            MRP: "75000",
            created_datetime: "2026-04-17T08:35:12.123Z",
            updated_datetime: "2026-04-17T09:10:45.567Z"
          }
        },
        failed: {
          status: "failed",
          message: "No product found for provided filters."
        }
      }
    },
    {
      id: 'update-transaction',
      name: 'Update Stock',
      endpoint: 'UpdateRFIDTransactionDetails',
      method: 'POST',
      baseUrl: 'https://soni.loyalstring.co.in/api/ProductMaster',
      description: 'Update RFID transaction details (commonly status). Accepts array payload.',
      sampleBody: [
        {
          client_code: "LS000365",
          itemcode: "22K OR",
          RFIDNumber: "123456",
          status: "Sold"
        }
      ],
      responseFormat: {
        status: "success|partial|failed",
        message: "string",
        updatedItems: 1,
        totalRequested: 1,
        notFoundItems: 0,
        notFoundItemErrors: [],
        invalidStatusItems: 0,
        invalidStatusItemErrors: []
      }
    },
    {
      id: 'update-existing-products',
      name: 'Update Existing Products',
      endpoint: 'UpdateExistingProducts',
      method: 'POST',
      baseUrl: 'https://soni.loyalstring.co.in/api/ProductMaster',
      description: 'Update existing labelled products using array payload with RFID/itemcode and editable stock metadata.',
      sampleBody: [
        {
          client_code: "LS000365",
          itemcode: "22K OR",
          RFIDNumber: "123456",
          product_code: "PRD001",
          description: "itemsize:2.12, HUIDCode:45857KIKL",
          category_id: "GOLD",
          product_id: "22K G JE12.12P",
          design_id: "KS",
          purity_id: "22k",
          branch_id: "CPC",
          counter_id: "TA",
          vendor_id: "Vendor Name",
          box_details: "Box A",
          box: "Box A",
          packet: "Packet 1",
          grosswt: "0",
          stonewt: "0",
          stoneamount: "0.00",
          diamondWeight: "0",
          diamondAmount: "0.00",
          netwt: "0",
          status: "ApiActive"
          ,
          imageurl: "",
          HallmarkAmount: "0.00",
          MakingPerGram: "125.00",
          MakingPercentage: "0.00",
          MakingFixedAmt: "0.00",
          MRP: "0.000"
        }
      ],
      responseFormat: {
        status: "success|failed",
        message: "string",
        updatedItems: 1,
        totalRequested: 1,
        notFoundItems: 0,
        details: [
          {
            RFIDCode: "123456",
            ItemCode: "22K OR",
            ProductName: "22K G JE12.12P",
            CategoryName: "GOLD",
            UpdatedFields: {
              GrossWt: "0",
              NetWt: "0",
              StoneWeight: "0",
              StoneAmount: "0.00",
              DiamondAmount: "0.00",
              DiamondWeight: "0",
              MRP: "0.000",
              HallmarkAmount: "0.00",
              MakingPerGram: "125.00",
              MakingPercentage: "0.00",
              MakingFixedAmt: "0.00",
              BoxDetails: "Box A",
              Description: "itemsize:2.12, HUIDCode:45857KIKL",
              VendorId: "Vendor Name",
              PacketId: 1,
              Status: "ApiActive"
            }
          }
        ],
        notFoundDetails: []
      }
    },
    {
      id: 'get-transaction',
      name: 'Get Stock Details',
      endpoint: 'GetRFIDTransactionDetails',
      method: 'POST',
      baseUrl: 'https://soni.loyalstring.co.in/api/ProductMaster',
      description: 'Retrieve all RFID transaction details for a client code with optional status filter.',
      sampleBody: {
        client_code: "LS000365",
        status: "ApiActive"
      },
      responseFormat: {
        data: [
          {
            id: 101,
            categoryId: "GOLD",
            productId: "22K G JE12.12P",
            RFIDNumber: "123456",
            itemCode: "22K OR",
            boxName: "Box A",
            grossWt: "0",
            stoneWeight: "0",
            stoneAmount: "0.00",
            netWt: "0",
            image: "",
            tidValue: "EPC/TID",
            clientCode: "LS000365",
            status: "ApiActive",
            HallmarkAmount: "0.00",
            MRP: "0.000",
            MakingPerGram: "125.00",
            MakingPercentage: "0.00",
            MakingFixedAmt: "0.00",
            totalDiamondAmount: "0.00",
            totalDiamondWeight: "0",
            createdOn: "datetime"
          }
        ],
        summary: {
          totalRecords: 1,
          recordCount: 1,
          status: "All records retrieved successfully",
          isComplete: true,
          missingRecords: 0
        },
        performance: {
          queryTime: "Optimized with SQL JOINs - NO LIMITS",
          memoryUsage: "Minimal - NoTracking enabled",
          optimization: "Single query with JOINs for maximum performance - ALL RECORDS",
          debugInfo: "string",
          method: "LINQ Query"
        }
      }
    },
    {
      id: 'delete-labelled-stock',
      name: 'Delete Labelled Stock Items',
      endpoint: 'DeleteLabelledStockItems',
      method: 'POST',
      baseUrl: 'https://soni.loyalstring.co.in/api/ProductMaster',
      description: 'Delete specific labelled stock items by providing their item codes.',
      sampleBody: {
        ClientCode: "LS000123",
        ItemCodes: ["SAU124", "SAU125"]
      },
      responseFormat: {
        message: "Success",
        deletedCount: 2
      }
    },
    {
      id: 'delete-all-stock',
      name: 'Delete All Stock for Client',
      endpoint: 'DeleteAllStockForClient',
      method: 'DELETE',
      baseUrl: 'https://soni.loyalstring.co.in/api/ProductMaster',
      description: 'Delete all stock items for a specific client. Use with caution as this is irreversible.',
      sampleBody: null,
      urlParams: '?ClientCode=LS000123',
      responseFormat: {
        message: "All stock deleted successfully"
      }
    },
    {
      id: 'delete-stock-by-branch',
      name: 'Delete Stock for Client by Branch',
      endpoint: 'DeleteStockForClientByBranch',
      method: 'DELETE',
      baseUrl: 'https://soni.loyalstring.co.in/api/ProductMaster',
      description:
        'Deletes ApiActive labelled stock for one branch only. Query: ClientCode + BranchName.',
      sampleBody: null,
      urlParams: '?ClientCode=LS000410&BranchName=Main%20Showroom',
      responseFormat: {
        status: 'success',
        message: "Successfully deleted 120 ApiActive labelled stock record(s) for branch 'Main Showroom' only.",
        deletedCount: 120,
        clientCode: 'LS000410',
        branchId: 3,
        branchName: 'Main Showroom',
        deletedAt: '2026-07-08T06:23:45.1234567Z',
      },
    },
    {
      id: 'delete-all-sold-stock',
      name: 'Delete All Sold Stock',
      endpoint: 'DeleteAllSoldStockForClient',
      method: 'POST',
      baseUrl: 'https://soni.loyalstring.co.in/api/ProductMaster',
      description: 'Delete all sold stock items for a specific client.',
      sampleBody: {
        ClientCode: "LS000123"
      },
      responseFormat: {
        message: "All sold stock deleted successfully"
      }
    },
    {
      id: 'get-all-labeled-stock',
      name: 'Get All Labeled Stock',
      endpoint: 'GetAllLabeledStock',
      method: 'POST',
      baseUrl: 'https://rrgold.loyalstring.co.in/api/ProductMaster',
      description: 'Retrieve all labeled stock items with pagination support.',
      sampleBody: {
        ClientCode: "LS000123",
        PageNumber: 1,
        PageSize: 25
      },
      responseFormat: {
        data: [],
        totalRecords: 100,
        totalPages: 4
      }
    },
    {
      id: 'get-all-stock-android',
      name: 'Get All Stock (Android)',
      endpoint: 'GetAllStockAndroid',
      method: 'POST',
      baseUrl: 'https://rrgold.loyalstring.co.in/api/ProductMaster',
      description: 'Retrieve all stock data optimized for Android applications.',
      sampleBody: {
        ClientCode: "LS000123"
      },
      responseFormat: {
        data: []
      }
    },
    {
      id: 'get-all-product-master',
      name: 'Get All Product Master',
      endpoint: 'GetAllProductMaster',
      method: 'POST',
      baseUrl: 'https://rrgold.loyalstring.co.in/api/ProductMaster',
      description: 'Retrieve all product master data for dropdowns and selections.',
      sampleBody: {
        ClientCode: "LS000123"
      },
      responseFormat: {
        data: []
      }
    },
    {
      id: 'get-all-design',
      name: 'Get All Design',
      endpoint: 'GetAllDesign',
      method: 'POST',
      baseUrl: 'https://rrgold.loyalstring.co.in/api/ProductMaster',
      description: 'Retrieve all design master data.',
      sampleBody: {
        ClientCode: "LS000123"
      },
      responseFormat: {
        data: []
      }
    },
    {
      id: 'get-all-category',
      name: 'Get All Category',
      endpoint: 'GetAllCategory',
      method: 'POST',
      baseUrl: 'https://rrgold.loyalstring.co.in/api/ProductMaster',
      description: 'Retrieve all category master data.',
      sampleBody: {
        ClientCode: "LS000123"
      },
      responseFormat: {
        data: []
      }
    },
    {
      id: 'stock-verification',
      name: 'Stock Verification by Session',
      endpoint: 'GetAllStockVerificationBySession',
      method: 'POST',
      baseUrl: 'https://rrgold.loyalstring.co.in/api/ProductMaster',
      description: 'List sessions without ScanBatchId (20 per page). Open one session with ScanBatchId (50 match + 50 unmatch). Use PageNumber / PageSize and Paging.HasNextPage. Do not send ReturnAllData.',
      sampleBody: {
        ClientCode: "LS000123",
        PageNumber: 1,
        PageSize: 20
      },
      responseFormat: {
        Sessions: [
          {
            SessionNumber: "1",
            ScanBatchId: "your-session-guid",
            StartedOn: "2024-01-01T10:00:00",
            EndedOn: "2024-01-01T11:00:00",
            MatchQty: 150,
            UnmatchQty: 5
          }
        ],
        Paging: {
          PageNumber: 1,
          PageSize: 20,
          HasNextPage: true
        }
      }
    },
    {
      id: 'delete-stock-verification-by-date',
      name: 'Delete Stock Verification By Date',
      endpoint: 'DeleteStockVerificationByDate',
      method: 'POST',
      baseUrl: 'https://rrgold.loyalstring.co.in/api/ProductMaster',
      description: 'Deletes stock verification batches for one client and one date only (CreatedOn / LastUpdated). Removes the full batch: all matched and unmatched rows. Other dates are not touched.',
      sampleBody: {
        ClientCode: 'LS000123',
        Date: '2026-09-03'
      },
      responseFormat: {
        Message: 'Stock verification batches deleted successfully.',
        ClientCode: 'LS000123',
        Date: '2026-09-03',
        DeletedBatches: 3,
        DeletedRecords: 120
      }
    },
    {
      id: 'get-stock-taking-matched-list',
      name: 'Get Stock Taking Matched List',
      endpoint: 'GetStockTakingMatchedList',
      method: 'POST',
      baseUrl: 'https://rrgold.loyalstring.co.in/api/ProductMaster',
      description: 'Get unique matched RFID tags for one client, branch, and stock-taking date. Same payload as the Stock Taking Matched List page. BranchAddress accepts branch id, name, or address. StockTakingDate is YYYY-MM-DD.',
      sampleBody: {
        ClientCode: 'LS000123',
        BranchAddress: '1007',
        StockTakingDate: '2026-09-16'
      },
      responseFormat: {
        Message: 'Matched stock taking list loaded successfully.',
        BranchName: 'Main Showroom',
        BranchAddress: '1007',
        TotalSessionsFound: 2,
        TotalMatchedRecordsScanned: 48,
        TotalUniqueMatchedTags: 42,
        Totals: {
          TotalQty: 42,
          TotalGrossWeight: 185.25,
          TotalNetWeight: 172.1
        },
        MatchedList: [
          {
            ItemCode: 'ITEM001',
            RFIDCode: 'E280116060000204006625B6',
            CategoryName: 'Gold',
            ProductName: 'Ring',
            DesignName: 'Plain',
            PurityName: '22CT',
            GrossWeight: 4.25,
            NetWeight: 4.1,
            Quantity: 1,
            CounterName: 'Gold Counter',
            BranchName: 'Main Showroom',
            BranchAddress: '1007',
            Status: 'Match'
          }
        ]
      }
    },
    {
      id: 'get-stock-taking-unmatched-list',
      name: 'Get Stock Taking Unmatched List',
      endpoint: 'GetStockTakingUnmatchedList',
      method: 'POST',
      baseUrl: 'https://rrgold.loyalstring.co.in/api/ProductMaster',
      description: 'Get unique unmatched RFID tags (status UnMatch, latest scan only) for one client, branch, and stock-taking date. POST body: ClientCode, BranchAddress, StockTakingDate. GET also works: ?clientCode=&branchAddress=&stockTakingDate=. Same shape as matched list, with UnmatchedList. ProductScan fallback exists.',
      sampleBody: {
        ClientCode: 'LS000123',
        BranchAddress: '1007',
        StockTakingDate: '2026-09-16'
      },
      responseFormat: {
        Message: 'Unmatched stock taking list loaded successfully.',
        BranchName: 'Main Showroom',
        BranchAddress: '1007',
        TotalSessionsFound: 2,
        TotalUnmatchedRecordsScanned: 12,
        TotalUniqueUnmatchedTags: 10,
        Totals: {
          TotalQty: 10,
          TotalGrossWeight: 42.5,
          TotalNetWeight: 38.2
        },
        UnmatchedList: [
          {
            ItemCode: 'ITEM009',
            RFIDCode: 'E280116060000204006625C8',
            SKU: 'SKU-009',
            HUID: 'HUID123',
            CategoryName: 'Gold',
            ProductName: 'Chain',
            DesignName: 'Rope',
            PurityName: '22CT',
            GrossWeight: 8.5,
            NetWeight: 8.1,
            Quantity: 1,
            CounterName: 'Gold Counter',
            BranchName: 'Main Showroom',
            BranchAddress: '1007',
            Status: 'UnMatch'
          }
        ]
      }
    },
    {
      id: 'tag-usage',
      name: 'Get Used/Unused RFID Tags',
      endpoint: 'GetAllUsedAndUnusedTag',
      method: 'POST',
      baseUrl: 'https://rrgold.loyalstring.co.in/api/ProductMaster',
      description: 'Retrieve all used and unused RFID tags with counts.',
      sampleBody: {
        ClientCode: "LS000123"
      },
      responseFormat: {
        "Used": ["RFID1", "RFID2"],
        "Unused": ["RFID3", "RFID4"],
        "UsedCount": 350,
        "UnusedCount": 180
      }
    },
    // RFID Device APIs
    {
      id: 'get-all-rfid-details',
      name: 'Get All RFID Device Details',
      endpoint: 'GetAllRFIDDetails',
      method: 'POST',
      baseUrl: 'https://rrgold.loyalstring.co.in/api/RFIDDevice',
      description: 'Retrieve all RFID device details including device IDs, status, and location information.',
      sampleBody: {
        ClientCode: "LS000123"
      },
      responseFormat: {
        data: [
          {
            "DeviceId": "DEV001",
            "Status": "Active",
            "Location": "Warehouse A",
          }
        ]
      }
    },
    {
      id: 'delete-rfid-by-device',
      name: 'Delete RFID by Client and Device',
      endpoint: 'DeleteRFIDByClientAndDevice',
      method: 'POST',
      baseUrl: 'https://rrgold.loyalstring.co.in/api/RFIDDevice',
      description: 'Delete RFID data for a specific client and device combination.',
      sampleBody: {
        ClientCode: "LS000123",
        DeviceId: "DEV001"
      },
      responseFormat: {
        message: "RFID data deleted successfully"
      }
    },
    // RFID Label Template APIs
    {
      id: 'add-template',
      name: 'Add Label Template',
      endpoint: 'AddTemplate',
      method: 'POST',
      baseUrl: 'https://rrgold.loyalstring.co.in/api/RFIDLabelTemplate',
      description: 'Create a new RFID label template.',
      sampleBody: {
        ClientCode: "LS000123",
        TemplateName: "Standard Label",
        TemplateData: {}
      },
      responseFormat: {
        message: "Template created successfully",
        templateId: "TMP001"
      }
    },
    {
      id: 'get-all-templates',
      name: 'Get All Templates',
      endpoint: 'GetAllTemplates',
      method: 'POST',
      baseUrl: 'https://rrgold.loyalstring.co.in/api/RFIDLabelTemplate',
      description: 'Retrieve all label templates for a client.',
      sampleBody: {
        ClientCode: "LS000123"
      },
      responseFormat: {
        data: []
      }
    },
    {
      id: 'get-template-by-id',
      name: 'Get Template by ID',
      endpoint: 'GetTemplateById',
      method: 'POST',
      baseUrl: 'https://rrgold.loyalstring.co.in/api/RFIDLabelTemplate',
      description: 'Retrieve a specific template by its ID.',
      sampleBody: {
        ClientCode: "LS000123",
        TemplateId: "TMP001"
      },
      responseFormat: {
        data: {}
      }
    },
    {
      id: 'update-template',
      name: 'Update Template',
      endpoint: 'UpdateTemplate',
      method: 'POST',
      baseUrl: 'https://rrgold.loyalstring.co.in/api/RFIDLabelTemplate',
      description: 'Update an existing label template.',
      sampleBody: {
        TemplateId: "TMP001",
        TemplateName: "Updated Label",
        TemplateData: {}
      },
      responseFormat: {
        message: "Template updated successfully"
      }
    },
    {
      id: 'delete-template',
      name: 'Delete Template',
      endpoint: 'DeleteTemplate',
      method: 'POST',
      baseUrl: 'https://rrgold.loyalstring.co.in/api/RFIDLabelTemplate',
      description: 'Delete a label template.',
      sampleBody: {
        ClientCode: "LS000123",
        TemplateId: "TMP001"
      },
      responseFormat: {
        message: "Template deleted successfully"
      }
    },
    {
      id: 'generate-labels',
      name: 'Generate Labels',
      endpoint: 'GenerateLabels',
      method: 'POST',
      baseUrl: 'https://rrgold.loyalstring.co.in/api/RFIDLabelTemplate',
      description: 'Generate RFID labels based on template and data.',
      sampleBody: {
        ClientCode: "LS000123",
        TemplateId: "TMP001",
        Items: []
      },
      responseFormat: {
        message: "Labels generated successfully",
        downloadUrl: "..."
      }
    },
    // Client Onboarding APIs
    {
      id: 'get-all-counters',
      name: 'Get All Counters',
      endpoint: 'GetAllCounters',
      method: 'POST',
      baseUrl: 'https://rrgold.loyalstring.co.in/api/ClientOnboarding',
      description: 'Retrieve all counter information for a client (Create Masters).',
      sampleBody: {
        ClientCode: "LS000123"
      },
      responseFormat: {
        data: []
      }
    },
    {
      id: 'get-all-branch-master',
      name: 'Get Branch',
      endpoint: 'GetAllBranchMaster',
      method: 'POST',
      baseUrl: 'https://rrgold.loyalstring.co.in/api/ClientOnboarding',
      description: 'Retrieve all branch master data for a client (Create Masters). Same as GetAllBranchMaster.',
      sampleBody: {
        ClientCode: "LS000123"
      },
      responseFormat: {
        data: []
      }
    },
    {
      id: 'delete-branch',
      name: 'Delete Branch',
      endpoint: 'DeleteBranch',
      method: 'POST',
      baseUrl: 'https://soni.loyalstring.co.in/api/ClientOnboarding',
      description: 'Delete a branch by Id. Used on Create Masters. Body: ClientCode and Id.',
      sampleBody: {
        ClientCode: "LS000123",
        Id: 1
      },
      responseFormat: {
        status: "success",
        message: "Deleted successfully."
      }
    },
    {
      id: 'delete-branch-master',
      name: 'Delete Branch Master',
      endpoint: 'DeleteBranchMaster',
      method: 'POST',
      baseUrl: 'https://rrgold.loyalstring.co.in/api/ClientOnboarding',
      description: 'Delete a branch master by Id (RRGold Client Onboarding). Body: ClientCode and Id.',
      sampleBody: {
        ClientCode: "LS000123",
        Id: 1
      },
      responseFormat: {
        status: "success",
        message: "Deleted successfully."
      }
    },
    {
      id: 'delete-counter',
      name: 'Delete Counter',
      endpoint: 'DeleteCounter',
      method: 'POST',
      baseUrl: 'https://soni.loyalstring.co.in/api/ClientOnboarding',
      description: 'Delete a counter by Id. Used on Create Masters. Body: ClientCode and Id.',
      sampleBody: {
        ClientCode: "LS000123",
        Id: 1
      },
      responseFormat: {
        status: "success",
        message: "Deleted successfully."
      }
    },
    {
      id: 'add-multiple-branch-and-counter',
      name: 'Add Multiple Branch And Counter',
      endpoint: 'AddMultipleBranchAndCounter',
      method: 'POST',
      baseUrl: 'https://rrgold.loyalstring.co.in/api/ClientOnboarding',
      description: 'Save multiple branches into tblBranchMaster and multiple counters into tblCounter in one call.',
      sampleBody: {
        ClientCode: 'LS000123',
        Branches: [
          {
            BranchName: 'Main Branch',
            BranchAddress: 'MG Road, Bengaluru',
            Counters: [
              { CounterName: 'Gold Counter', CounterNumber: 'C001' },
              { CounterName: 'Silver Counter', CounterNumber: 'C002' },
            ],
          },
          {
            BranchName: 'Warehouse',
            BranchAddress: 'Peenya Industrial Area',
            Counters: [
              { CounterName: 'Warehouse Counter', CounterNumber: 'W001' },
            ],
          },
        ],
      },
      responseFormat: {
        message: 'Branches and counters saved successfully',
      },
    },
    // Export APIs
    {
      id: 'send-label-stock-email',
      name: 'Send Label Stock Email',
      endpoint: 'SendLabelStockEmail',
      method: 'POST',
      baseUrl: 'https://rrgold.loyalstring.co.in/api/Export',
      description: 'Send labeled stock data via email in Excel or PDF format.',
      sampleBody: {
        ClientCode: "LS000123",
        EmailAddress: "user@example.com",
        Format: "Excel", // or "PDF"
        Filters: {}
      },
      responseFormat: {
        message: "Email sent successfully"
      }
    },
    {
      id: 'get-all-rfid',
      name: 'Get All RFID',
      endpoint: 'GetAllRFID',
      method: 'POST',
      baseUrl: 'https://rrgold.loyalstring.co.in/api/ProductMaster',
      description: 'Retrieve all RFID tags for a client.',
      sampleBody: {
        ClientCode: "LS000123"
      },
      responseFormat: {
        data: []
      }
    },
    {
      id: 'update-client-tid-value',
      name: 'Update Client TID Value',
      endpoint: 'UpdateClientTidValue',
      method: 'POST',
      baseUrl: 'https://rrgold.loyalstring.co.in/api/ProductMaster',
      description: 'Update the TID (Tag ID) value for RFID tags.',
      sampleBody: {
        ClientCode: "LS000123",
        RFIDNumber: "RFID001",
        TIDValue: "TID123456"
      },
      responseFormat: {
        message: "TID value updated successfully"
      }
    },
    {
      id: 'sync-labelled-stock-tid',
      name: 'Sync Labelled Stock TID From RFID Table',
      endpoint: 'SyncLabelledStockTIDFromRfidTable',
      method: 'POST',
      baseUrl: 'https://rrgold.loyalstring.co.in/api/ProductMaster',
      description: 'Reads RFIDCode from labelled stock, looks up EPC in tblRFID and tblRFIDdetails, and writes TIDNumber. Multiple EPC values are joined with a comma.',
      sampleBody: {
        ClientCode: 'LS000641'
      },
      responseFormat: {
        Message: 'Labelled stock TIDNumber updated from RFID table EPC values.',
        ClientCode: 'LS000641',
        TotalChecked: 500,
        Updated: 420,
        NotFoundInRfidTable: 80,
        AlreadySame: 0,
        RfidTableMappings: 450,
        Samples: [
          {
            Id: 101,
            ItemCode: 'LS12345',
            RFIDCode: '3016',
            OldTIDNumber: '',
            NewTIDNumber: 'E280116060000204006625B6',
            EpcCount: 1
          }
        ]
      }
    }
  ];

  const baseUrls = [
    { name: 'Product Master API', url: 'https://soni.loyalstring.co.in/api/ProductMaster' },
    { name: 'RRGold Product Master API', url: 'https://rrgold.loyalstring.co.in/api/ProductMaster' },
    { name: 'RFID Device API', url: 'https://rrgold.loyalstring.co.in/api/RFIDDevice' },
    { name: 'RFID Label Template API', url: 'https://rrgold.loyalstring.co.in/api/RFIDLabelTemplate' },
    { name: 'Client Onboarding API', url: 'https://rrgold.loyalstring.co.in/api/ClientOnboarding' },
    { name: 'Soni Client Onboarding API', url: 'https://soni.loyalstring.co.in/api/ClientOnboarding' },
    { name: 'Export API', url: 'https://rrgold.loyalstring.co.in/api/Export' }
  ];

  return (
    <div style={{
      width: '100%',
      minHeight: '100vh',
      background: '#f8fafc',
      padding: '24px'
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto'
      }}>
        {/* Header */}
        <div style={{
          background: '#ffffff',
          borderRadius: '16px',
          padding: '32px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          marginBottom: '24px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '12px'
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: '24px'
            }}>
              <FaBook />
            </div>
            <div>
              <h1 style={{
                fontSize: '32px',
                fontWeight: 700,
                color: '#1e293b',
                margin: 0,
                letterSpacing: '-0.02em'
              }}>Complete API Documentation</h1>
              <p style={{
                margin: '4px 0 0 0',
                fontSize: '16px',
                color: '#64748b'
              }}>Comprehensive guide for third-party integration with all endpoints, payloads, and responses</p>
            </div>
          </div>
        </div>

        {/* Integration Guidelines */}
        <div style={{
          background: '#ffffff',
          borderRadius: '16px',
          padding: '32px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          marginBottom: '24px'
        }}>
          <h2 style={{
            fontSize: '24px',
            fontWeight: 700,
            color: '#1e293b',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <FaCode style={{ color: '#2563eb' }} />
            Integration Guidelines
          </h2>
          
          <div style={{
            background: '#f8fafc',
            padding: '24px',
            borderRadius: '12px',
            border: '1px solid #e2e8f0'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginBottom: '12px' }}>Authentication</h3>
            <p style={{ fontSize: '14px', color: '#475569', lineHeight: '1.7', marginBottom: '16px' }}>
              All API endpoints require authentication using Bearer token in the Authorization header:
            </p>
            <pre style={{
              background: '#1e293b',
              color: '#e2e8f0',
              padding: '16px',
              borderRadius: '8px',
              fontSize: '13px',
              overflowX: 'auto',
              marginBottom: '20px'
            }}>
{`Authorization: Bearer <your_token>
Content-Type: application/json`}
            </pre>

            <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginBottom: '12px', marginTop: '24px' }}>Base URLs</h3>
            <ul style={{ fontSize: '14px', color: '#475569', lineHeight: '1.8', paddingLeft: '20px', marginBottom: '20px' }}>
              {baseUrls.map((base, idx) => (
                <li key={idx} style={{ marginBottom: '8px' }}>
                  <strong>{base.name}:</strong> <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px' }}>{base.url}</code>
                </li>
              ))}
            </ul>

            <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginBottom: '12px', marginTop: '24px' }}>Client Code Security</h3>
            <p style={{ fontSize: '14px', color: '#475569', lineHeight: '1.7', marginBottom: '20px' }}>
              All requests are secured with your unique client code. You can only make requests with your own client code. 
              The client code is automatically validated and locked to your account for security.
            </p>

            <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginBottom: '12px', marginTop: '24px' }}>Error Handling</h3>
            <p style={{ fontSize: '14px', color: '#475569', lineHeight: '1.7', marginBottom: '12px' }}>
              All endpoints return standard HTTP status codes:
            </p>
            <ul style={{ fontSize: '14px', color: '#475569', lineHeight: '1.8', paddingLeft: '20px' }}>
              <li><strong>200 OK:</strong> Request successful</li>
              <li><strong>400 Bad Request:</strong> Invalid request parameters</li>
              <li><strong>401 Unauthorized:</strong> Invalid or expired token</li>
              <li><strong>403 Forbidden:</strong> Client code mismatch</li>
              <li><strong>500 Internal Server Error:</strong> Server error</li>
            </ul>
          </div>
        </div>

        {/* All API Endpoints */}
        <div style={{
          background: '#ffffff',
          borderRadius: '16px',
          padding: '32px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          marginBottom: '24px'
        }}>
          <h2 style={{
            fontSize: '24px',
            fontWeight: 700,
            color: '#1e293b',
            marginBottom: '24px'
          }}>All API Endpoints ({allAPIs.length})</h2>
          
          {allAPIs.map((api, idx) => {
            const isExpanded = expandedSections[api.id];
            return (
              <div key={api.id} style={{
                marginBottom: '16px',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                overflow: 'hidden'
              }}>
                <button
                  onClick={() => toggleSection(api.id)}
                  style={{
                    width: '100%',
                    padding: '20px 24px',
                    background: isExpanded ? '#f8fafc' : '#ffffff',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'background 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '8px',
                      background: api.method === 'POST' ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : api.method === 'GET' ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'linear-gradient(135deg, #dc2626, #b91c1c)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      fontWeight: 600,
                      fontSize: '14px'
                    }}>
                      {api.method === 'POST' ? 'POST' : api.method === 'GET' ? 'GET' : 'DEL'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <h3 style={{
                        fontSize: '18px',
                        fontWeight: 600,
                        color: '#1e293b',
                        margin: 0,
                        marginBottom: '4px'
                      }}>{api.name}</h3>
                      <code style={{
                        background: '#f1f5f9',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        color: '#475569'
                      }}>{api.baseUrl}/{api.endpoint}{api.urlParams || ''}</code>
                    </div>
                  </div>
                  {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
                </button>

                {isExpanded && (
                  <div style={{
                    padding: '24px',
                    background: '#ffffff',
                    borderTop: '1px solid #e2e8f0'
                  }}>
                    <p style={{
                      fontSize: '14px',
                      color: '#64748b',
                      lineHeight: '1.6',
                      marginBottom: '20px'
                    }}>{api.description}</p>

                    {api.sampleBody && (
                      <div style={{ marginBottom: '20px' }}>
                        <h4 style={{
                          fontSize: '16px',
                          fontWeight: 600,
                          color: '#1e293b',
                          marginBottom: '12px'
                        }}>Request Payload</h4>
                        <pre style={{
                          background: '#1e293b',
                          color: '#e2e8f0',
                          padding: '16px',
                          borderRadius: '8px',
                          fontSize: '13px',
                          overflowX: 'auto',
                          margin: 0
                        }}>
                          {JSON.stringify(api.sampleBody, null, 2)}
                        </pre>
                      </div>
                    )}

                    {api.urlParams && !api.sampleBody && (
                      <div style={{ marginBottom: '20px' }}>
                        <h4 style={{
                          fontSize: '16px',
                          fontWeight: 600,
                          color: '#1e293b',
                          marginBottom: '12px'
                        }}>URL Parameters</h4>
                        <p style={{
                          fontSize: '14px',
                          color: '#475569',
                          background: '#f8fafc',
                          padding: '12px',
                          borderRadius: '8px',
                          fontFamily: 'monospace'
                        }}>
                          {api.baseUrl}/{api.endpoint}{api.urlParams}
                        </p>
                      </div>
                    )}

                    <div>
                      <h4 style={{
                        fontSize: '16px',
                        fontWeight: 600,
                        color: '#1e293b',
                        marginBottom: '12px'
                      }}>Response Format</h4>
                      <div style={{
                        background: '#f8fafc',
                        padding: '16px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0'
                      }}>
                        <pre style={{ margin: 0, fontSize: '13px', color: '#475569', whiteSpace: 'pre-wrap' }}>
                          {typeof api.responseFormat === 'string' 
                            ? api.responseFormat 
                            : JSON.stringify(api.responseFormat, null, 2)}
                        </pre>
                      </div>
                    </div>

                    {/* Code Examples */}
                    <div style={{ marginTop: '24px' }}>
                      <h4 style={{
                        fontSize: '16px',
                        fontWeight: 600,
                        color: '#1e293b',
                        marginBottom: '12px'
                      }}>Code Examples</h4>
                      
                      <div style={{ marginBottom: '16px' }}>
                        <h5 style={{ fontSize: '14px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>JavaScript (Fetch API)</h5>
                        <pre style={{
                          background: '#1e293b',
                          color: '#e2e8f0',
                          padding: '16px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          overflowX: 'auto',
                          margin: 0
                        }}>
{api.sampleBody ? `const response = await fetch('${api.baseUrl}/${api.endpoint}${api.urlParams || ''}', {
  method: '${api.method}',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify(${JSON.stringify(api.sampleBody, null, 2)})
});

const data = await response.json();` : `const response = await fetch('${api.baseUrl}/${api.endpoint}${api.urlParams || ''}', {
  method: '${api.method}',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  }
});

const data = await response.json();`}
                        </pre>
                      </div>

                      <div>
                        <h5 style={{ fontSize: '14px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>cURL</h5>
                        <pre style={{
                          background: '#1e293b',
                          color: '#e2e8f0',
                          padding: '16px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          overflowX: 'auto',
                          margin: 0
                        }}>
{api.sampleBody ? `curl -X ${api.method} '${api.baseUrl}/${api.endpoint}${api.urlParams || ''}' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer YOUR_TOKEN' \\
  -d '${JSON.stringify(api.sampleBody)}'` : `curl -X ${api.method} '${api.baseUrl}/${api.endpoint}${api.urlParams || ''}' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer YOUR_TOKEN'`}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default APIDocumentation;

