// Example usage of SelectField with ReactNode labels
import React, { useState } from 'react';
import { SelectField } from '@components/Fields';
import type { Option } from '@client/shared/models/options';

// Example options with ReactNode titles
const statusOptions: Option<string>[] = [
  { 
    title: (
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
        <span>Active</span>
      </div>
    ), 
    value: 'active' 
  },
  { 
    title: (
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-red-500 rounded-full"></div>
        <span>Inactive</span>
      </div>
    ), 
    value: 'inactive' 
  },
  { 
    title: (
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
        <span>Pending</span>
      </div>
    ), 
    value: 'pending' 
  },
  { 
    title: (
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
        <span>Completed</span>
      </div>
    ), 
    value: 'completed' 
  },
];

const priorityOptions: Option<number>[] = [
  { 
    title: (
      <div className="flex items-center justify-between">
        <span>Low Priority</span>
        <span className="text-xs text-gray-500">1</span>
      </div>
    ), 
    value: 1 
  },
  { 
    title: (
      <div className="flex items-center justify-between">
        <span>Medium Priority</span>
        <span className="text-xs text-gray-500">2</span>
      </div>
    ), 
    value: 2 
  },
  { 
    title: (
      <div className="flex items-center justify-between">
        <span>High Priority</span>
        <span className="text-xs text-gray-500">3</span>
      </div>
    ), 
    value: 3 
  },
  { 
    title: (
      <div className="flex items-center justify-between">
        <span>Critical Priority</span>
        <span className="text-xs text-gray-500">4</span>
      </div>
    ), 
    value: 4 
  },
];

const SelectFieldExample: React.FC = () => {
  const [status, setStatus] = useState<string>('');
  const [priority, setPriority] = useState<number | undefined>(undefined);

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">SelectField with ReactNode Examples</h2>
      <p className="text-sm text-gray-600">
        These examples show SelectField with ReactNode titles. The search functionality 
        will extract text content from the ReactNode elements.
      </p>
      
      {/* SelectField with ReactNode status options */}
      <SelectField
        name="status"
        label="Status with Icons"
        value={status}
        onChange={setStatus}
        options={statusOptions}
        placeholder="Select status"
        searchable={true}
        clearable={true}
      />

      {/* SelectField with ReactNode priority options */}
      <SelectField
        name="priority"
        label="Priority with Numbers"
        value={priority}
        onChange={setPriority}
        options={priorityOptions}
        placeholder="Select priority"
        rules={{ required: [true] }}
        searchable={true}
        clearable={true}
      />

      <div className="mt-4 p-3 bg-gray-100 rounded">
        <h3 className="font-semibold mb-2">Search Test:</h3>
        <p className="text-sm text-gray-600">
          Try searching for: "Active", "Inactive", "Pending", "Completed", "Low", "Medium", "High", "Critical"
        </p>
        <p className="text-sm text-gray-600 mt-1">
          The search will work even though the options contain ReactNode elements with icons and styling.
        </p>
      </div>
    </div>
  );
};

export default SelectFieldExample;