const COLOURS = ["#f2c94c", "#f2994a", "#6fcf97", "#56ccf2"];

export default function Logo() {
  const letters = "CAPITALE".split("");
  const word = (cls: string, dx = 0, dy = 0) => (
    <text className={cls} x={8 + dx} y={52 + dy}>
      {letters.map((l, i) => (
        <tspan key={i} dy={i === 0 ? 0 : i % 2 ? -4 : 4} style={cls === "logo-letter" ? { fill: COLOURS[i % 4] } : undefined}>
          {l}
        </tspan>
      ))}
    </text>
  );
  return (
    <svg className="logo" viewBox="0 0 300 70" role="img" aria-label="Capitale">
      {word("logo-shadow", 2, 5)}
      {word("logo-letter")}
    </svg>
  );
}
