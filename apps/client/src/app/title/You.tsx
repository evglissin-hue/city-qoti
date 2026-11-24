import { copy } from '../../ui/copy';
import { SWATCHES, type PlayerProfile } from '../profile';

/** Your name and your color: the same two fields on the Join card and on the second step. */
export function YouFields({
  profile,
  onChange,
}: {
  profile: PlayerProfile;
  onChange: (p: PlayerProfile) => void;
}) {
  return (
    <div class="tf-you">
      <label class="tf-field">
        <span>{copy.title.yourName}</span>
        <input
          value={profile.name}
          maxLength={24}
          placeholder={copy.title.yourNamePlaceholder}
          data-testid="your-name"
          autocomplete="off"
          onInput={(e) => onChange({ ...profile, name: (e.target as HTMLInputElement).value })}
        />
      </label>
      <div class="swatches" role="radiogroup" aria-label={copy.title.yourColor}>
        <span class="swatch-label">{copy.title.yourColor}</span>
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={profile.color === c}
            aria-label={`#${c.toString(16).padStart(6, '0')}`}
            class={`swatch ${profile.color === c ? 'active' : ''}`}
            style={{ '--swatch': `#${c.toString(16).padStart(6, '0')}` }}
            data-testid={`swatch-${c.toString(16)}`}
            onClick={() => onChange({ ...profile, color: c })}
          />
        ))}
      </div>
    </div>
  );
}
