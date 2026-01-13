export default function InfoBox({
    label,
    value,
    onChange,
    placeholder,
    type = "text",
  }) {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label className="text-xs font-medium text-neutral-600">
            {label}
          </label>
        )}
  
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="
            h-10 rounded-xl px-3 text-sm
            border border-neutral-200
            bg-white text-neutral-900
            placeholder:text-neutral-400
            transition
            hover:border-neutral-300
            focus:border-orange-300
            focus:ring-2 focus:ring-orange-100
            focus:outline-none
          "
        />
      </div>
    );
  }