"use client";

type CheckboxProps = {
  label: string;
  checked: boolean;
  onChange: () => void;
};

const Checkbox = ({ label, checked, onChange }: CheckboxProps) => {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-600">
      <span
        className={`inline-flex h-4 w-4 items-center justify-center rounded border transition ${
          checked ? "border-purple-500 bg-purple-500" : "border-slate-300 bg-white"
        }`}
      >
        {checked && <span className="h-2 w-2 rounded-sm bg-white" />}
      </span>
      <span className="select-none">{label}</span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={onChange}
      />
    </label>
  );
};

export { Checkbox };
