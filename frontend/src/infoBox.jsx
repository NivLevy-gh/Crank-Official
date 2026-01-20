export default function InfoBox({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}) {
  return (
    <div className="flex w-full flex-col gap-1.5">
      {label && (
        <label className="text-xs font-medium text-neutral-700">
          {label}
        </label>
      )}

      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="
          h-10 w-full rounded-md px-3 text-sm
          border border-neutral-200
          bg-white text-neutral-900
          placeholder:text-neutral-400

          transition
          hover:border-neutral-300

          focus:outline-none
          focus:border-[rgb(242,200,168)]
          focus:ring-2
          focus:ring-[rgb(251,236,221)]
        "
      />
    </div>
  );
}