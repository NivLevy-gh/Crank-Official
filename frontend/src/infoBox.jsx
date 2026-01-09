export default function InfoBox({className, placeholder,onChange, type, label}) {
    return(
        <div>
            <label className="text-white text-xs">
                {label}
            <input
                className="border border-neutral-700 rounded-xl p-2 h-10 bg-neutral-900/70 w-[24rem] text-white text-sm mt-1 shadow-lg"
                placeholder={placeholder}
                onChange={onChange}
                type={type}
            />
            </label>


        </div>
    );
}