import { textOn } from "../colors";

interface Props {
  name: string;
  color: string;
  photoUrl: string | null;
  size?: number;
}

export default function Avatar({ name, color, photoUrl, size = 48 }: Props) {
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: color,
        color: textOn(color),
        // The colored ring doubles as the user's color marker, even with a photo.
        boxShadow: `0 0 0 3px ${color}`,
      }}
      aria-hidden
    >
      {photoUrl ? <img src={photoUrl} alt="" /> : (name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}
