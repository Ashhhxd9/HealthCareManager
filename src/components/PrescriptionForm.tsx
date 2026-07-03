"use client";

import React, { useState } from "react";
import { Plus, Trash2, Pill } from "lucide-react";

interface Prescription {
  drugName: string;
  dosage: string;
  frequency: "morning" | "night" | "twice_daily" | "thrice_daily";
}

interface PrescriptionFormProps {
  prescriptions: Prescription[];
  onChange: (prescriptions: Prescription[]) => void;
}

export default function PrescriptionForm({ prescriptions, onChange }: PrescriptionFormProps) {
  const [drugName, setDrugName] = useState("");
  const [dosage, setDosage] = useState("");
  const [frequency, setFrequency] = useState<Prescription["frequency"]>("twice_daily");

  const handleAdd = () => {
    if (!drugName || !dosage) return;

    const newItem: Prescription = {
      drugName,
      dosage,
      frequency,
    };

    onChange([...prescriptions, newItem]);
    
    // reset inputs
    setDrugName("");
    setDosage("");
    setFrequency("twice_daily");
  };

  const handleRemove = (index: number) => {
    const updated = prescriptions.filter((_, i) => i !== index);
    onChange(updated);
  };

  return (
    <div style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid var(--border-color)", padding: "1.25rem", borderRadius: "var(--radius-sm)", marginBottom: "1.25rem" }}>
      <h4 style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "1rem", marginBottom: "1rem", color: "var(--accent-color)" }}>
        <Pill size={16} />
        Prescription Manager
      </h4>

      {/* Current items */}
      {prescriptions.length === 0 ? (
        <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginBottom: "1rem" }}>No medications added yet.</p>
      ) : (
        <ul style={{ listStyle: "none", marginBottom: "1rem" }}>
          {prescriptions.map((p, idx) => (
            <li
              key={idx}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.5rem 0.75rem",
                backgroundColor: "var(--bg-tertiary)",
                border: "1px solid var(--border-color)",
                borderRadius: "4px",
                marginBottom: "0.5rem",
                fontSize: "0.9rem",
              }}
            >
              <div>
                <strong>{p.drugName}</strong> - {p.dosage} ({p.frequency.replace("_", " ")})
              </div>
              <button
                type="button"
                onClick={() => handleRemove(idx)}
                style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer" }}
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add new medication form */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <input
            type="text"
            placeholder="Drug Name (e.g. Paracetamol)"
            value={drugName}
            onChange={(e) => setDrugName(e.target.value)}
            className="form-input"
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <input
            type="text"
            placeholder="Dosage (e.g. 500mg)"
            value={dosage}
            onChange={(e) => setDosage(e.target.value)}
            className="form-input"
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
        <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as Prescription["frequency"])}
            className="form-select"
          >
            <option value="morning">Morning (Once Daily - 8:00 AM)</option>
            <option value="night">Night (Once Daily - 8:00 PM)</option>
            <option value="twice_daily">Twice Daily (8:00 AM, 8:00 PM)</option>
            <option value="thrice_daily">Thrice Daily (8:00 AM, 2:00 PM, 8:00 PM)</option>
          </select>
        </div>
        
        <button
          type="button"
          onClick={handleAdd}
          disabled={!drugName || !dosage}
          className="btn btn-primary"
          style={{ padding: "0.75rem" }}
        >
          <Plus size={16} />
          Add Item
        </button>
      </div>
    </div>
  );
}
