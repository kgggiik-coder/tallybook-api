import React, { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Calendar, DollarSign, AlertTriangle, Check, X, Clock, Plus,
  Trash2, TrendingDown, Landmark, Loader2, LogOut, ChevronDown, Users, CreditCard
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip, Cell } from "recharts";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const COLORS = {
  ink: "#1C2B22", paper: "#F3F1EC", paperDeep: "#EBE7DD",
  moss: "#2F5233", brass: "#B8923F", rust: "#B4472A", slate: "#5C6660",
};

const STATUS = {
  BOOKED: { label: "Booked", color: COLORS.slate, icon: Clock },
  DONE: { label: "Done", color: COLORS.moss, icon: Check },
  NOSHOW: { label: "No-show", color: COLORS.rust, icon: X },
  CANCELLED: { label: "Cancelled", color: COLORS.rust, icon: X },
};

const SWIPE_OPEN = -168;

function money(n) {
  return n < 0 ? `-$${Math.abs(n).toLocaleString()}` : `$${n.toLocaleString()}`;
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function ScheduleRow({ row, onSetStatus, onDelete, canSeeMoney }) {
  const [dragX, setDragX] = useState(0);
  const [open, setOpen] = useState(false);
  const startX = useRef(null);
  const dragging = useRef(false);

  const onPointerDown = (e) => { startX.current = e.clientX; dragging.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const onPointerMove = (e) => {
    if (!dragging.current || startX.current === null) return;
    const delta = e.clientX - startX.current;
    const base = open ? SWIPE_OPEN : 0;
    setDragX(Math.min(0, Math.max(SWIPE_OPEN, base + delta)));
  };
  const endDrag = () => {
    dragging.current = false;
    const shouldOpen = dragX < SWIPE_OPEN / 2;
    setOpen(shouldOpen);
    setDragX(shouldOpen ? SWIPE_OPEN : 0);
  };

  const s = STATUS[row.status];
  const negative = row.status === "NOSHOW" || row.status === "CANCELLED";
  const time = new Date(row.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <div className="tb-row relative border-t overflow-hidden" style={{ borderColor: COLORS.paperDeep }}>
      <div className="absolute inset-y-0 right-0 flex items-stretch lg:hidden" style={{ width: 168 }}>
        <button onClick={() => { onSetStatus(row.id, "DONE"); setOpen(false); setDragX(0); }} className="flex flex-col items-center justify-center gap-1 text-xs text-white" style={{ width: 56, background: COLORS.moss }}><Check size={18} /> Done</button>
        <button onClick={() => { onSetStatus(row.id, "NOSHOW"); setOpen(false); setDragX(0); }} className="flex flex-col items-center justify-center gap-1 text-xs text-white" style={{ width: 56, background: COLORS.brass }}><X size={18} /> No-show</button>
        <button onClick={() => onDelete(row.id)} className="flex flex-col items-center justify-center gap-1 text-xs text-white" style={{ width: 56, background: COLORS.rust }}><Trash2 size={18} /> Delete</button>
      </div>

      <div
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
        className="relative grid grid-cols-[52px_1fr_auto] lg:grid-cols-[64px_1fr_150px_auto] gap-2 lg:gap-3 px-3 sm:px-4 py-3 items-center"
        style={{ background: COLORS.paper, transform: `translateX(${dragX}px)`, transition: dragging.current ? "none" : "transform 160ms ease-out" }}
      >
        <span className="text-xs sm:text-sm" style={{ color: COLORS.slate }}>{time}</span>
        <span className="min-w-0">
          <span className="block text-sm sm:text-base truncate">{row.client?.name}</span>
          <span className="flex items-center gap-1.5 text-xs mt-0.5 lg:hidden" style={{ color: s.color }}><s.icon size={11} /> {s.label} &middot; {row.service}</span>
          <span className="hidden lg:block text-xs mt-0.5" style={{ color: COLORS.slate }}>{row.service}</span>
        </span>
        <span className="hidden lg:flex items-center gap-1 text-xs" style={{ color: s.color }}><s.icon size={12} /> {s.label}</span>
        <span className="flex items-center gap-2 justify-end">
          {canSeeMoney ? (
            <span className="text-sm sm:text-base" style={{ fontFamily: "'Source Serif 4', serif", color: negative ? COLORS.rust : COLORS.ink, minWidth: 56 }}>
              {negative ? `-${money(Number(row.value))}` : money(Number(row.value))}
            </span>
          ) : (
            <span className="text-xs" style={{ color: COLORS.slate }}>&mdash;</span>
          )}
          <span className="hidden lg:flex items-center gap-1">
            <button onClick={() => onSetStatus(row.id, "DONE")} title="Mark done" className="p-1.5 border" style={{ borderColor: COLORS.paperDeep, color: COLORS.moss }}><Check size={14} /></button>
            <button onClick={() => onSetStatus(row.id, "NOSHOW")} title="Mark no-show" className="p-1.5 border" style={{ borderColor: COLORS.paperDeep, color: COLORS.rust }}><X size={14} /></button>
            <button onClick={() => onDelete(row.id)} title="Delete" className="p-1.5 border" style={{ borderColor: COLORS.paperDeep, color: COLORS.slate }}><Trash2 size={14} /></button>
          </span>
        </span>
      </div>
    </div>
  );
}

function AddAppointmentSheet({ open, onClose, onSubmit }) {
  const [draft, setDraft] = useState({ time: "", clientName: "", service: "", value: "" });
  if (!open) return null;
  const submit = (e) => {
    e.preventDefault();
    if (!draft.time || !draft.clientName || !draft.value) return;
    onSubmit(draft);
    setDraft({ time: "", clientName: "", service: "", value: "" });
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      
