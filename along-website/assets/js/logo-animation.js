// Logo brush drawing animation from traced paths
// Uses logo.json with stroke order and logo-order.png for timing

export async function loadLogoData() {
  const response = await fetch('/assets/img/brand/logo.json');
  return response.json();
}

export function createLogoAnimation(svg, paths, duration = 2400) {
  const totalLength = paths.reduce((sum, p) => sum + p.length, 0);
  let elapsed = 0;
  
  paths.forEach((pathData, index) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData.d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    
    const length = path.getTotalLength();
    path.style.strokeDasharray = length;
    path.style.strokeDashoffset = length;
    
    const delay = (elapsed / totalLength) * duration;
    const strokeDuration = (length / totalLength) * duration;
    
    path.style.animation = `draw-stroke ${strokeDuration}ms ease-out ${delay}ms forwards`;
    svg.appendChild(path);
    
    elapsed += length;
  });
  
  return duration;
}

export function setupLogoReveal(container) {
  const svg = container.querySelector('svg');
  if (!svg) return;
  
  loadLogoData().then(data => {
    if (data.strokes && Array.isArray(data.strokes)) {
      createLogoAnimation(svg, data.strokes);
    }
  });
}
