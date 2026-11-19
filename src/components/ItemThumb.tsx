interface Props {
  name: string;
  photoUrl: string | null;
  size?: number;
}

/** A square photo of an item, or a plain tile with its first letter when it has none. */
export default function ItemThumb({ name, photoUrl, size = 56 }: Props) {
  return (
    <span className="thumb" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden>
      {photoUrl ? <img src={photoUrl} alt="" /> : (name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}
