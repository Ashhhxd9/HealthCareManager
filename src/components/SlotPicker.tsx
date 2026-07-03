"use client";

import React, { useState, useEffect } from "react";
import { Calendar, Clock, AlertTriangle } from "lucide-react";

interface Slot {
  time: string;
  displayTime: string;
  status: "available" | "booked" | "held" | "past" | string;
}

interface SlotPickerProps {
  doctorId: string;
  onSlotHeld: (slotTime: string) => void;
  onError: (msg: string) => void;
}

export default function SlotPicker({ doctorId, onSlotHeld, onError }: SlotPickerProps) {
  const [dates, setDates] = useState<{ label: string; value: string }[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [reservingSlot, setReservingSlot] = useState<string | null>(null);

  // Generate today and next 6 days
  useEffect(() => {
    const datesList = [];
    const today = new Date();
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const value = `${year}-${month}-${day}`;

      // Date labeling
      let label = date.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
      if (i === 0) label = "Today";
      else if (i === 1) label = "Tomorrow";

      datesList.push({ label, value });
    }
    
    setDates(datesList);
    setSelectedDate(datesList[0].value);
  }, []);

  // Fetch slots whenever doctorId or selectedDate changes
  useEffect(() => {
    if (!doctorId || !selectedDate) return;

    const fetchSlots = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/appointments/slots?doctorId=${doctorId}&date=${selectedDate}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setSlots(data.slots || []);
      } catch (err: any) {
        console.error(err);
        onError(err.message || "Failed to load slots");
      } finally {
        setLoading(false);
      }
    };

    fetchSlots();
  }, [doctorId, selectedDate, onError]);

  const handleSelectSlot = async (slot: Slot) => {
    if (slot.status !== "available") return;
    
    setReservingSlot(slot.time);
    try {
      const res = await fetch("/api/appointments/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorId, slotTime: slot.time }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to hold slot");
      }

      onSlotHeld(slot.time);
    } catch (err: any) {
      onError(err.message || "Failed to hold slot. It may have been locked by another user.");
      // Refresh slots
      const refreshRes = await fetch(`/api/appointments/slots?doctorId=${doctorId}&date=${selectedDate}`);
      const refreshData = await refreshRes.json();
      setSlots(refreshData.slots || []);
    } finally {
      setReservingSlot(null);
    }
  };

  return (
    <div style={{ marginTop: "1rem" }}>
      <h4 style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem", fontSize: "1rem", color: "var(--text-primary)" }}>
        <Calendar size={18} />
        Select an Appointment Date
      </h4>

      <div className="date-picker-grid">
        {dates.map((d) => (
          <button
            key={d.value}
            type="button"
            className={`date-btn ${selectedDate === d.value ? "active" : ""}`}
            onClick={() => setSelectedDate(d.value)}
          >
            {d.label}
          </button>
        ))}
      </div>

      <h4 style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem", fontSize: "1rem", color: "var(--text-primary)" }}>
        <Clock size={18} />
        Available Slots
      </h4>

      {loading ? (
        <p style={{ color: "var(--text-secondary)" }}>Loading slots...</p>
      ) : slots.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "1rem", backgroundColor: "rgba(255,255,255,0.02)", border: "1px dashed var(--border-color)", borderRadius: "var(--radius-sm)" }}>
          <AlertTriangle size={16} style={{ color: "var(--warning)" }} />
          <p style={{ margin: 0, fontSize: "0.9rem" }}>No slots available. Dr. may be on leave or fully booked on this day.</p>
        </div>
      ) : (
        <div className="slots-grid">
          {slots.map((slot) => (
            <button
              key={slot.time}
              type="button"
              disabled={slot.status !== "available" || reservingSlot !== null}
              className={`slot-btn ${slot.status} ${reservingSlot === slot.time ? "selected" : ""}`}
              onClick={() => handleSelectSlot(slot)}
            >
              {reservingSlot === slot.time ? "Holding..." : slot.displayTime}
            </button>
          ))}
        </div>
      )}
      
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "1rem" }}>
        * Selecting an available slot reserves it for 5 minutes while you fill in your symptoms.
      </p>
    </div>
  );
}
