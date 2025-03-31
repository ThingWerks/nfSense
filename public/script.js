let staticChart = null, cfg, buf = [];
setInterval(() => { updateStaticGraph() }, 3000); updateStaticGraph();
const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
const ws = new WebSocket(protocol + window.location.host);
const ctxLive = document.getElementById('liveChart').getContext('2d');
const liveData = {
    datasets: [
        { label: 'Live Data 1', data: [], borderColor: 'red', fill: true },
        { label: 'Live Data 2', data: [], borderColor: 'blue', fill: true }
    ]
};
const liveChart = new Chart(ctxLive, {
    type: 'line',
    data: liveData,
    options: {
        scales: {
            x: {
                type: 'time',
                time: { unit: 'second' },
                ticks: { font: { size: 20 }, source: 'auto', color: 'green', display: false }
            },
            y: { ticks: { font: { size: 20 }, color: 'green', }, beginAtZero: true },
        },
        animation: false,
        elements: { line: { tension: 0.9 } },
    }
});
ws.onopen = () => console.log("WebSocket connected");
ws.onerror = (error) => console.error("WebSocket error: ", error);
ws.onclose = () => {
    console.log("WebSocket closed. Attempting to reconnect...");
    setTimeout(() => location.reload(), 5000);
};
ws.onmessage = (event) => {
    try {
        const data = JSON.parse(event.data);
        if (data.cfg != undefined) { cfg = JSON.parse(event.data).cfg; }
        else {
            //    console.log(data.statPlus.pingDrop)
            if (data.chart != undefined && data.chart.bandwidth) {
                let chart = data.chart.bandwidth;
                const timeNow = new Date(chart.x);
                liveData.datasets[0].data.push({ x: timeNow, y: chart.y });
                liveData.datasets[1].data.push({ x: timeNow, y: chart.y2 || chart.y });
                if (liveData.datasets[0].data.length > 60) {
                    liveData.datasets[0].data.shift();
                    liveData.datasets[1].data.shift();
                }
                liveChart.update('active');
            }
            if (cfg != undefined && data.stat != undefined) {
                buf = [
                    { label: "Total Sockets:" },
                    { label: "DHCP Users:" },
                    { label: "ARP Table:" },
                    { label: "CPU (all/cores):" },
                    { label: "RAM (used/total):" },
                ];
                update("stat-label", buf);
                buf = [
                    { label: data.stat.conntrack.total },
                    { label: data.stat.dhcp.total },
                    { label: data.statPlus.arpTable },
                    { label: data.stat.cpu + "%" },
                    { label: data.stat.mem[1] + " / " + data.stat.mem[0] },

                ];
                update("stat-value", buf);
            }
            if (data.state.gateways[0].status != undefined) {
                for (let x = 0; x < data.state.gateways.length; x++) {
                    if (x == 0) { buf = Array.from({ length: 5 }, e => Array(0)); }
                    let statusClass;
                    if (data.state.gateways[x].status.trim() === "online") statusClass = "on";
                    else if (data.state.gateways[x].status.includes("degraded")) statusClass = "lag";
                    else statusClass = "off";
                    buf[0].push({
                        label: cfg.network.gateway.pool[x].name,
                        status: data.state.gateways[x].status,
                        statusClass: statusClass
                    });
                    buf[1].push({ label: data.stat.conntrack.gateways[x] });
                    buf[2].push({ label: data.state.gateways[x].pingAverageWAN });
                    buf[3].push({ label: data.statPlus.pingDrop[x] });
                    if (x == data.state.gateways.length - 1) {
                        updateStatus("router-status", buf[0]);
                        update("router-sockets", buf[1]);
                        update("router-ping", buf[2]);
                        update("router-drops", buf[3]);
                    }
                }
            }
        }
    } catch (error) { console.error("Error processing WebSocket message: ", error); }
};
function updateStatus(containerId, dataList, rightAlign) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";
    dataList.forEach(item => {
        const box = document.createElement("div");
        //   box.className = "data-item";
        if (rightAlign) box.classList.add("right-align");
        const statusClassAttr = item.statusClass ? `class="${item.statusClass}"` : ""; // Only add class if defined
        box.innerHTML = `${item.label}&nbsp&nbsp&nbsp<span ${statusClassAttr}>${item.status}</span>`;
        container.appendChild(box);
    });
}
function update(containerId, dataList, textColor = "", bold, fontSize = "",) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";
    dataList.forEach(item => {
        const box = document.createElement("div");
        //   box.className = "data-item";
        if (item.textColor) box.style.color = item.textColor;
        else if (textColor) box.style.color = textColor;
        if (fontSize) box.style.fontSize = fontSize;
        if (bold) box.style.fontWeight = "bold";
        box.textContent = item.label;
        container.appendChild(box);
    });
}
function updateStaticGraph() {
    fetch('/data')
        .then(response => response.json())
        .then(({ data, labels }) => {
           // console.log("data length: " + data.length); // Debugging: Ensure data length is 144
            const ctx = document.getElementById('staticChart').getContext('2d');
            if (!staticChart) {
                staticChart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels, // Use backend-provided labels
                        datasets: [{
                            label: 'Static Data',
                            data: data.map(d => d.y),
                            borderColor: 'blue',
                            fill: false
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        scales: {
                            x: {
                                type: 'category', // Treat x-axis as categorical (to use hour labels)
                                ticks: {
                                    autoSkip: false, // Ensure all labels from backend are respected
                                    callback: function(value, index) {
                                        return labels[index] || ''; // Show only provided hour labels
                                    }
                                }
                            },
                            y: {
                                beginAtZero: true,
                                ticks: { font: { size: 20 }, color: 'green' }
                            },
                            x: {
                                type: 'category',
                                ticks: {
                                    font: { size: 14 },
                                    autoSkip: false,  // Enables skipping labels
                                    maxTicksLimit: 15,  // Try different vaslues (e.g., 6 for fewer labels)
                                    autoSkipPadding: 30,  // More padding = fewer labels
                                    color: 'blue',
                                    maxRotation: 90,  // Slight tilt if needed
                                    minRotation: 45
                                }
                            }
                            
                        }
                    }
                });
            } else {
                staticChart.data.labels = labels;
                staticChart.data.datasets[0].data = data.map(d => d.y);
                staticChart.update();
            }
        });
}



document.getElementById('logout-btn').addEventListener('click', () => {
    // Redirect to a logout endpoint or a fake login page to force re-authentication
    window.location.href = '/logout';
});
