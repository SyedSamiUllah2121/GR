'use client';

import React, { useId } from 'react';

/**
 * A text field with a list of known answers attached.
 *
 * Every asset field that has a vocabulary uses this — type, make, capacity,
 * location — and none of them is a `<select>`. A select would be tidier and
 * would be wrong: the register has sixty-six kinds of electrical machine and
 * will have a sixty-seventh the first time somebody buys one, and a fitter
 * standing in front of it must be able to record what is actually there. So
 * the list suggests, and typing overrules it.
 *
 * Built on `<datalist>` rather than a hand-rolled popup. It is one element,
 * it is keyboard- and screen-reader-correct without any work, it filters as
 * you type on every browser that matters, and it degrades to a plain text
 * box on any that does not — which is exactly the failure mode you want,
 * because the field still takes the answer.
 */
export const Combobox: React.FC<{
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Announced to a screen reader when the visible label is not enough. */
  ariaLabel?: string;
}> = ({ id, value, onChange, options, placeholder, className, disabled, ariaLabel }) => {
  /*
   * Scoped to this instance rather than to the field name. Two of these can
   * be on screen at once — the location on the asset form and the location in
   * the import preview — and a shared list id would point both at whichever
   * rendered last.
   */
  const listId = `${id}-options-${useId().replace(/:/g, '')}`;

  return (
    <>
      <input
        id={id}
        type="text"
        role="combobox"
        list={listId}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        className={className}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </>
  );
};

export default Combobox;
