import React, { useCallback, useEffect, useState } from 'react';
import { FaStar, FaTimes } from 'react-icons/fa';
import { useNotifications } from '../../context/NotificationContext';
import {
  excelExportFieldDisplayHint,
  mergeExcelExportFieldsWithCatalog,
  storageExcelExportFieldKey,
  defaultCatalogFields,
  deleteExcelExportTemplate,
  excelExportApiError,
  getExcelExportFields,
  getExcelExportTemplateById,
  getExcelExportTemplates,
  pickActiveExcelExportTemplate,
  readExcelExportSession,
  rememberExcelExportTemplateId,
  saveExcelExportTemplate,
  setDefaultExcelExportTemplate,
} from '../../services/excelExportTemplateApi';
import '../../styles/ExcelExportTemplate.css';

const cloneFields = (fields) => {
  const rows = (Array.isArray(fields) ? fields : []).map((field, index) => ({
    key: storageExcelExportFieldKey(field.key),
    label: field.label || field.key,
    selected: field.selected !== false,
    order: index + 1,
  }));
  const hidden = new Set(['itemcode', 'diamondWeight']);
  const kept = [];
  const seen = new Set();
  rows.forEach((field) => {
    if (hidden.has(field.key)) return;
    if (seen.has(field.key)) return;
    seen.add(field.key);
    kept.push(field);
  });
  const itemCode = rows.find((field) => field.key === 'itemcode');
  const diamond = rows.find((field) => field.key === 'diamondWeight');
  if (itemCode) {
    const main = kept.find((field) => field.key === 'Itemcode');
    if (main) {
      if (itemCode.selected) main.selected = true;
    } else {
      kept.push({ ...itemCode, key: 'Itemcode', label: itemCode.label || 'Item Code' });
    }
  }
  if (diamond) {
    const main = kept.find((field) => field.key === 'diamondweight');
    if (main) {
      if (diamond.selected) main.selected = true;
    } else {
      kept.push({ ...diamond, key: 'diamondweight', label: diamond.label || 'Diamond Weight' });
    }
  }
  return kept.map((field, index) => ({ ...field, order: index + 1 }));
};

const ExcelExportTemplateBar = ({ onTemplateChange }) => {
  const notifications = useNotifications();
  const addNotification = notifications?.addNotification;
  const { clientCode, userId } = readExcelExportSession();
  const [templates, setTemplates] = useState([]);
  const [activeId, setActiveId] = useState(0);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [draftId, setDraftId] = useState(0);
  const [draftName, setDraftName] = useState('Default');
  const [draftDefault, setDraftDefault] = useState(true);
  const [draftFields, setDraftFields] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dragIndex, setDragIndex] = useState(-1);
  const [fieldQuery, setFieldQuery] = useState('');

  const showError = useCallback((message) => {
    setError(message);
    if (addNotification) {
      addNotification({
        title: 'Export template',
        description: message,
        type: 'error',
      });
    }
  }, [addNotification]);

  const publish = useCallback((template) => {
    if (template?.id) rememberExcelExportTemplateId(template.id);
    if (onTemplateChange) onTemplateChange(template || null);
  }, [onTemplateChange]);

  const refreshTemplates = useCallback(async (preferId) => {
    if (!clientCode) return [];
    const list = await getExcelExportTemplates(clientCode, userId);
    setTemplates(list);
    const active = list.find((item) => preferId && Number(item.id) === Number(preferId))
      || pickActiveExcelExportTemplate(list);
    setActiveId(active?.id || 0);
    publish(active);
    return list;
  }, [clientCode, userId, publish]);

  useEffect(() => {
    let cancelled = false;
    if (!clientCode) return undefined;
    setLoading(true);
    refreshTemplates()
      .catch((err) => {
        if (!cancelled) {
          setTemplates([]);
          showError(excelExportApiError(err, 'Could not load export templates.'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientCode, refreshTemplates]);

  const openEditor = async () => {
    setError('');
    setFieldQuery('');
    setModalOpen(true);
    setSaving(true);
    try {
      const current = templates.find((item) => Number(item.id) === Number(activeId));
      let fields = current?.fields?.length
        ? mergeExcelExportFieldsWithCatalog(current.fields)
        : [];
      if (!fields.length && clientCode) {
        fields = await getExcelExportFields(clientCode);
      }
      if (!fields.length) fields = defaultCatalogFields();
      setDraftId(current?.id || 0);
      setDraftName(current?.templateName || 'Default');
      setDraftDefault(current ? current.isDefault : true);
      setDraftFields(cloneFields(fields));
    } catch (err) {
      const raw = excelExportApiError(err, 'Could not load export fields.');
      showError(/404/.test(raw)
        ? 'Saved fields could not be loaded. The full list is shown so you can still choose columns.'
        : raw);
      setDraftFields(defaultCatalogFields());
    } finally {
      setSaving(false);
    }
  };

  const onPickTemplate = async (id) => {
    const nextId = Number(id) || 0;
    setActiveId(nextId);
    const known = templates.find((item) => Number(item.id) === nextId);
    if (known) {
      publish(known);
      return;
    }
    if (!clientCode || !nextId) return;
    try {
      const loaded = await getExcelExportTemplateById(clientCode, nextId);
      if (loaded) publish(loaded);
    } catch (err) {
      showError(excelExportApiError(err));
    }
  };

  const moveField = (from, to) => {
    if (to < 0 || to >= draftFields.length || from === to) return;
    setDraftFields((prev) => {
      const next = prev.slice();
      const [row] = next.splice(from, 1);
      next.splice(to, 0, row);
      return next.map((field, index) => ({ ...field, order: index + 1 }));
    });
  };

  const saveDraft = async () => {
    const selectedCount = draftFields.filter((field) => field.selected).length;
    if (!selectedCount) {
      setError('Select at least one field.');
      return;
    }
    const templateName = draftName.trim();
    if (!templateName) {
      setError('Enter a template name.');
      return;
    }
    if (!clientCode) {
      setError('Client code missing. Please log in again.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = await saveExcelExportTemplate({
        ...(draftId ? { id: draftId } : {}),
        clientCode,
        templateName,
        isDefault: draftDefault,
        userId,
        fields: draftFields.map((field, index) => ({
          key: field.key,
          label: field.label,
          selected: Boolean(field.selected),
          order: index + 1,
        })),
      });
      await refreshTemplates(saved?.id || draftId);
      setModalOpen(false);
    } catch (err) {
      showError(excelExportApiError(err, 'Could not save the template.'));
    } finally {
      setSaving(false);
    }
  };

  const markDefault = async () => {
    if (!activeId || !clientCode) return;
    setLoading(true);
    setError('');
    try {
      const saved = await setDefaultExcelExportTemplate(clientCode, activeId);
      await refreshTemplates(saved?.id || activeId);
    } catch (err) {
      showError(excelExportApiError(err, 'Could not set the default template.'));
    } finally {
      setLoading(false);
    }
  };

  const removeTemplate = async () => {
    if (!draftId) return;
    if (!window.confirm(`Delete template "${draftName}"?`)) return;
    setSaving(true);
    setError('');
    try {
      await deleteExcelExportTemplate(clientCode, draftId);
      await refreshTemplates();
      setModalOpen(false);
    } catch (err) {
      showError(excelExportApiError(err, 'Could not delete the template.'));
    } finally {
      setSaving(false);
    }
  };

  const active = templates.find((item) => Number(item.id) === Number(activeId));
  const selectedCount = draftFields.filter((field) => field.selected).length;
  const query = fieldQuery.trim().toLowerCase();
  const visibleFields = draftFields
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => !query || field.label.toLowerCase().includes(query) || field.key.toLowerCase().includes(query));

  const setAllSelected = (selected) => {
    setDraftFields((prev) => prev.map((field) => ({ ...field, selected })));
  };

  return (
    <>
      <div className="eet-bar">
        <div className="eet-bar-top">
          <span className="eet-kicker">Excel columns</span>
          <span className="eet-hint">
            {active?.templateName || 'Default'}
            {active?.isDefault || !templates.length ? ' · used for Excel' : ''}
          </span>
        </div>
        <div className="eet-bar-row">
        <select
          className="eet-select"
          value={activeId || ''}
          disabled={loading || !templates.length}
          onChange={(event) => onPickTemplate(event.target.value)}
          aria-label="Excel export template"
          title="Saved Excel export template"
        >
          {!templates.length ? <option value="">Default</option> : null}
          {templates.map((item) => (
            <option key={item.id} value={item.id}>
              {item.templateName}{item.isDefault ? ' (Default)' : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="eet-btn"
          onClick={openEditor}
          disabled={loading || !clientCode}
          title="Choose which columns go into Excel"
        >
          Edit fields
        </button>
        <button
          type="button"
          className={`eet-btn is-star${active?.isDefault ? ' is-on' : ''}`}
          onClick={markDefault}
          disabled={loading || !activeId || active?.isDefault}
          title={active?.isDefault ? 'This template is the default' : 'Mark this template as default'}
        >
          <FaStar />
        </button>
        </div>
      </div>
      {error && !modalOpen ? <p className="eet-error">{error}</p> : null}

      {modalOpen ? (
        <div className="eet-overlay" onClick={() => !saving && setModalOpen(false)}>
          <div className="eet-modal" onClick={(event) => event.stopPropagation()}>
            <div className="eet-head">
              <div>
                <h2>Export fields</h2>
                <p>Choose columns and drag them into the Excel order. The key stays the column header.</p>
              </div>
              <button type="button" className="eet-close" onClick={() => setModalOpen(false)} aria-label="Close">
                <FaTimes />
              </button>
            </div>
            <div className="eet-toolbar">
              <label className="eet-name">
                <span>Template name</span>
                <input
                  type="text"
                  value={draftName}
                  placeholder="Name this template"
                  onChange={(event) => setDraftName(event.target.value)}
                />
              </label>
              <label className={`eet-check${draftDefault ? ' is-on' : ''}`}>
                <input
                  type="checkbox"
                  checked={draftDefault}
                  onChange={(event) => setDraftDefault(event.target.checked)}
                />
                Default
              </label>
              <button
                type="button"
                className="eet-ghost"
                onClick={() => {
                  setDraftId(0);
                  setDraftName('');
                  setDraftDefault(templates.length === 0);
                }}
              >
                New template
              </button>
            </div>
            <div className="eet-tools">
              <input
                type="search"
                className="eet-search"
                value={fieldQuery}
                placeholder="Search fields"
                onChange={(event) => setFieldQuery(event.target.value)}
              />
              <span className="eet-count">{selectedCount} of {draftFields.length} selected</span>
              <button type="button" className="eet-link" onClick={() => setAllSelected(true)}>All</button>
              <button type="button" className="eet-link" onClick={() => setAllSelected(false)}>None</button>
            </div>
            <div className="eet-body">
              {visibleFields.length ? visibleFields.map(({ field, index }) => (
                <div
                  key={`${field.key}-${index}`}
                  className={`eet-field${field.selected ? '' : ' is-off'}${dragIndex === index ? ' is-drag' : ''}`}
                  draggable={!query}
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    moveField(dragIndex, index);
                    setDragIndex(-1);
                  }}
                  onDragEnd={() => setDragIndex(-1)}
                >
                  <button type="button" className="eet-drag" aria-label="Drag to reorder" tabIndex={-1}>
                    <span />
                    <span />
                    <span />
                  </button>
                  <input
                    type="checkbox"
                    checked={field.selected}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setDraftFields((prev) => prev.map((row, rowIndex) => (
                        rowIndex === index ? { ...row, selected: checked } : row
                      )));
                    }}
                  />
                  <div className="eet-field-copy">
                    <strong>{field.label}</strong>
                    <small>{excelExportFieldDisplayHint(field.key)}</small>
                  </div>
                  <span className="eet-order">{index + 1}</span>
                </div>
              )) : (
                <p className="eet-empty">No fields match that search.</p>
              )}
            </div>
            {error ? <p className="eet-error">{error}</p> : null}
            <div className="eet-foot">
              {draftId ? (
                <button type="button" className="eet-danger" onClick={removeTemplate} disabled={saving}>
                  Delete
                </button>
              ) : <span />}
              <div className="eet-foot-actions">
                <button type="button" className="eet-ghost" onClick={() => setModalOpen(false)} disabled={saving}>
                  Cancel
                </button>
                <button type="button" className="eet-primary" onClick={saveDraft} disabled={saving}>
                  {saving ? 'Saving…' : 'Save template'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default ExcelExportTemplateBar;
