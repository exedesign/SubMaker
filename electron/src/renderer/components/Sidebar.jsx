import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { FiMenu, FiChevronDown, FiChevronRight } from 'react-icons/fi';
import StyleEditor from './StyleEditor';
import LanguageSelector from './LanguageSelector';
import ModelSelector from './ModelSelector';

// Section definitions — id is stable key, title is display label
const SECTIONS = [
  { id: 'language', title: 'Language Settings', component: LanguageSelector },
  { id: 'whisper', title: 'Subtitles', component: ModelSelector },
  { id: 'style', title: 'Subtitle Style', component: StyleEditor },
];

const DEFAULT_ORDER = SECTIONS.map(s => s.id);
const ORDER_KEY = 'submaker-sidebar-order';
const COLLAPSED_KEY = 'submaker-sidebar-collapsed';

function loadSavedOrder() {
  try {
    const saved = localStorage.getItem(ORDER_KEY);
    if (!saved) return DEFAULT_ORDER;
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed) || parsed.length !== DEFAULT_ORDER.length) return DEFAULT_ORDER;
    const valid = DEFAULT_ORDER.every(id => parsed.includes(id));
    return valid ? parsed : DEFAULT_ORDER;
  } catch {
    return DEFAULT_ORDER;
  }
}

function loadCollapsedState() {
  try {
    const saved = localStorage.getItem(COLLAPSED_KEY);
    if (!saved) return {};
    return JSON.parse(saved);
  } catch {
    return {};
  }
}

function Sidebar() {
  const { currentStep, mediaFile } = useAppStore();
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [sectionOrder, setSectionOrder] = useState(loadSavedOrder);
  const [collapsed, setCollapsed] = useState(loadCollapsedState);
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleResizeStart = useCallback((e) => {
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = sidebarWidth;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  }, [sidebarWidth]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing.current) return;
      const delta = e.clientX - startX.current;
      const newWidth = Math.max(250, Math.min(450, startWidth.current + delta));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Toggle section collapse
  const toggleCollapse = useCallback((id) => {
    setCollapsed(prev => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Drag handlers
  const handleDragStart = useCallback((e, id) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    if (e.currentTarget) {
      e.currentTarget.style.opacity = '0.5';
    }
  }, []);

  const handleDragEnd = useCallback((e) => {
    if (e.currentTarget) {
      e.currentTarget.style.opacity = '1';
    }
    setDraggedId(null);
    setDragOverId(null);
  }, []);

  const handleDragOver = useCallback((e, id) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id !== dragOverId) {
      setDragOverId(id);
    }
  }, [dragOverId]);

  const handleDrop = useCallback((e, targetId) => {
    e.preventDefault();
    const sourceId = draggedId;
    if (!sourceId || sourceId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    setSectionOrder(prev => {
      const newOrder = [...prev];
      const sourceIdx = newOrder.indexOf(sourceId);
      const targetIdx = newOrder.indexOf(targetId);
      if (sourceIdx === -1 || targetIdx === -1) return prev;

      newOrder.splice(sourceIdx, 1);
      newOrder.splice(targetIdx, 0, sourceId);

      localStorage.setItem(ORDER_KEY, JSON.stringify(newOrder));
      return newOrder;
    });

    setDraggedId(null);
    setDragOverId(null);
  }, [draggedId]);

  // Build ordered section list
  const sectionMap = {};
  SECTIONS.forEach(s => { sectionMap[s.id] = s; });
  const orderedSections = sectionOrder.map(id => sectionMap[id]).filter(Boolean);

  // Don't show sidebar on upload step
  if (currentStep === 'upload' || !mediaFile) {
    return null;
  }

  return (
    <aside className="sidebar" style={{ width: sidebarWidth, minWidth: 250, maxWidth: 450 }}>
      <div className="sidebar-content">
        {orderedSections.map((section) => {
          const Component = section.component;
          const isDragging = draggedId === section.id;
          const isDragOver = dragOverId === section.id && draggedId !== section.id;
          const isCollapsed = !!collapsed[section.id];

          return (
            <div
              key={section.id}
              className={`sidebar-section${isDragging ? ' dragging' : ''}${isDragOver ? ' drag-over' : ''}${isCollapsed ? ' collapsed' : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, section.id)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, section.id)}
              onDrop={(e) => handleDrop(e, section.id)}
            >
              <h3
                className="sidebar-section-title"
                onClick={() => toggleCollapse(section.id)}
              >
                <span
                  className="sidebar-drag-handle"
                  title="Drag to reorder"
                  onClick={(e) => e.stopPropagation()}
                >
                  <FiMenu size={12} />
                </span>
                <span className="sidebar-section-label">{section.title}</span>
                <span className="sidebar-collapse-icon">
                  {isCollapsed ? <FiChevronRight size={14} /> : <FiChevronDown size={14} />}
                </span>
              </h3>
              {!isCollapsed && (
                <div className="sidebar-section-body">
                  <Component />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Resize handle */}
      <div
        className="sidebar-resize-handle"
        onMouseDown={handleResizeStart}
      />
    </aside>
  );
}

export default Sidebar;
