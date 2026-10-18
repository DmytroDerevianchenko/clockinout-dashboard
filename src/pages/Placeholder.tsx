// A page that is on the plan but not built yet — says so instead of 404ing.
export default function Placeholder({ title, phase }: { title: string; phase: number }) {
    return (
        <div className="card">
            <h2>{title}</h2>
            <p className="muted">Coming in phase {phase} of the web dashboard. Until then, use the phone app for this.</p>
        </div>
    );
}
