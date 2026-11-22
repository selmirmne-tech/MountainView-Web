import { useEffect, useState } from "react";
import { onValue, child } from "firebase/database";
import { completeOrdersRestoran } from "../firebase/refs";

export default function Racuni() {

useEffect(() => {
  window.scrollTo(0, 0);
}, []);

  const [orders, setOrders] = useState([]);
  const [totalPazar, setTotalPazar] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  const [selectedOrder, setSelectedOrder] = useState(null);

  const parseCompletedTime = (status) => {
    if (!status) return 0;

    try {
      const raw = status.replace("Complete", "").trim();
      const match = raw.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
      if (match) {
        return new Date(
          Number(match[3]), Number(match[2]) - 1, Number(match[1]),
          Number(match[4]), Number(match[5]), Number(match[6] || 0)
        ).getTime();
      }
      const direct = new Date(raw).getTime();
      return Number.isFinite(direct) ? direct : 0;
    } catch {
      return 0;
    }
  };

  const formatReceiptDate = (timestamp) => {
    const date = new Date(timestamp);
    const weekdays = ["Nedelja", "Ponedeljak", "Utorak", "Srijeda", "Četvrtak", "Petak", "Subota"];
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${weekdays[date.getDay()]}, ${day}/${month}/${date.getFullYear()}`;
  };

  const getReceiptItems = (order) => {
    const names = String(order?.name || "").split(/\r?\n/);
    const descriptions = String(order?.description || "").split(/\r?\n/);
    return names.map((name, index) => ({
      name: name.trim(),
      description: String(descriptions[index] || "").trim(),
    })).filter((item) => item.name || item.description);
  };

  useEffect(() => {

    const user = JSON.parse(localStorage.getItem("user"));
    const uid = user?.uid;

    if (!uid) {
      setLoading(false);
      setError("Korisnik nije prijavljen");
      return;
    }

    const ordersRef = child(completeOrdersRestoran(), uid);
    let timeout = setTimeout(() => {
      setLoading(false);
      setError("Nema konekcije ili server ne odgovara");
    }, 10000);

    const unsubOrders = onValue(ordersRef, (snapshot) => {

      clearTimeout(timeout);

      setLoading(false);
      setError(null);

      if (!snapshot.exists()) {
        setOrders([]);
        setTotalPazar(0);
        return;
      }

      const data = snapshot.val();

      let list = [];
      let sum = 0;

      Object.keys(data).forEach(orderId => {
        const order = data[orderId];

        list.push({
          id: orderId,
          ...order
        });

        const price = parseFloat(order.totalPrice || 0);
        sum += isNaN(price) ? 0 : price;
      });

      list.sort((a, b) =>
        parseCompletedTime(b.status) - parseCompletedTime(a.status)
      );

      setOrders(list);
      setTotalPazar(sum);
    });

    return () => {
      clearTimeout(timeout);
      unsubOrders();
    };

  }, []);

  const orderGroups = [];
  orders.forEach((order) => {
    const timestamp = parseCompletedTime(order.status);
    const date = new Date(timestamp);
    const dateKey = Number.isNaN(date.getTime()) || timestamp <= 0
      ? "unknown-date"
      : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    let group = orderGroups[orderGroups.length - 1];
    if (!group || group.key !== dateKey) {
      group = {
        key: dateKey,
        title: dateKey === "unknown-date" ? "Datum nije dostupan" : formatReceiptDate(timestamp),
        orders: [],
      };
      orderGroups.push(group);
    }
    group.orders.push(order);
  });

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

if (loading) {
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#f2f2f2",
        flexDirection: "column",
        gap: 10
      }}
    >

      <div
        style={{
          width: 50,
          height: 50,
          border: "5px solid #ccc",
          borderTop: "5px solid #2c2c44",
          borderRadius: "50%",
          animation: "spin 1s linear infinite"
        }}
      />

      <div
        style={{
          fontSize: 13,
          color: "#666"
        }}
      >
        Učitavanje podataka...
      </div>


      <style>
        {`
          @keyframes spin {
            0% { 
              transform: rotate(0deg); 
            }

            100% { 
              transform: rotate(360deg); 
            }
          }
        `}
      </style>

    </div>
  );
}

  return (
  <div style={{
  height: "100vh",
  background: "#f1f5f9",
  padding: "clamp(12px, 2.5vw, 28px)",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    }}>

      {isOffline && (
        <div style={{
          background: "#ffcc00",
          color: "#333",
          padding: 10,
          borderRadius: 10,
          marginBottom: 10,
          textAlign: "center",
          fontSize: 13,
          fontWeight: "bold"
        }}>
          Nema internet konekcije — podaci se neće osvježavati
        </div>
      )}

      {error && (
        <div style={{
          background: "#ffdddd",
          color: "#a10000",
          padding: 10,
          borderRadius: 10,
          marginBottom: 10,
          textAlign: "center",
          fontSize: 13
        }}>
          {error}
        </div>
      )}

      <div style={{
        background: "linear-gradient(135deg, #123d32, #176b55)",
        color: "white",
        padding: "20px 24px",
        borderRadius: 20,
        marginBottom: 12,
        textAlign: "center",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
      }}>
        <div style={{ fontSize: 12, opacity: 0.8, letterSpacing: ".12em", fontWeight: 800 }}>
          UKUPAN PAZAR
        </div>

        <div style={{
          fontSize: "clamp(28px, 5vw, 38px)",
          fontWeight: "bold",
          marginTop: 5
        }}>
          {totalPazar.toFixed(2)} €
        </div>
      </div>

      <div style={{
        flex: 1,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 22,
        padding: "2px 3px 24px"
      }}>

        {orderGroups.map((group) => (
          <section key={group.key} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "4px 2px" }}>
              <h2 style={{ margin: 0, color: "#173c32", fontSize: 15, fontWeight: 850, letterSpacing: ".01em" }}>{group.title}</h2>
              <span style={{ padding: "4px 9px", borderRadius: 999, background: "#e3eee9", color: "#36584b", fontSize: 11, fontWeight: 750, whiteSpace: "nowrap" }}>{group.orders.length} računa</span>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {group.orders.map(order => (
          <div
            key={order.id}
            onClick={() => {
              setSelectedOrder(order);
            }}
            style={{
              background: "white",
              borderRadius: 16,
              padding: "15px 16px",
              boxShadow: "0 3px 12px rgba(15, 45, 35, 0.06)",
              border: "1px solid #e2eae6",
              borderLeft: "4px solid #176b55",
              cursor: "pointer",
              transition: "transform .16s ease, box-shadow .16s ease"
            }}
          >
            <div style={{ fontWeight: "bold" }}>
              {order.orderPersonName}
            </div>
			
			
	{order.addittionalInfo && (
  <div style={{
    marginTop: 6,
    display: "inline-block",
    background: "#eef2ff",
    color: "#3730a3",
    fontSize: 11,
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid #c7d2fe",
    fontWeight: 500,
    maxWidth: "100%",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
  }}>
     {order.addittionalInfo}
  </div>
)}
			
			
			
			

            <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>
              {order.name}
            </div>

            <div style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 10
            }}>
              <div style={{ fontSize: 12, opacity: 0.6 }}>
                {order.status}
              </div>

              <div style={{ fontWeight: "bold" }}>
                {order.totalPrice} €
              </div>
            </div>
          </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {selectedOrder && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 1200,
          background: "rgba(0,0,0,0.6)",
          display: "flex",
          alignItems: "flex-end",
          padding: "12px 12px 0"
        }}
        onClick={() => setSelectedOrder(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              width: "100%",
              maxWidth: 680,
              maxHeight: "88dvh",
              overflowY: "auto",
              margin: "0 auto",
              padding: 20,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              boxShadow: "0 -16px 45px rgba(15, 45, 35, .18)"
            }}
          >
            <h3>{selectedOrder.orderPersonName}</h3>

{selectedOrder.addittionalInfo && (
  <div style={{
    marginTop: 8,
    marginBottom: 10,
    background: "#f1f5f9",
    border: "1px solid #e2e8f0",
    padding: "8px 10px",
    borderRadius: 10,
    fontSize: 13,
    color: "#334155",
    lineHeight: 1.4
  }}>
    <div style={{
      fontSize: 11,
      fontWeight: "bold",
      color: "#64748b",
      marginBottom: 4
    }}>
      DODATNE INFORMACIJE
    </div>

    {selectedOrder.addittionalInfo}
  </div>
)}
			
            <div style={{ marginTop: 14 }}>
              <div style={{ margin: "0 0 8px 2px", color: "#64748b", fontSize: 11, fontWeight: 800, letterSpacing: ".1em" }}>NARUČENI ARTIKLI</div>
              <div style={{ display: "grid", gap: 8 }}>
                {getReceiptItems(selectedOrder).map((item, index) => (
                  <div key={`${index}-${item.name}`} style={{ padding: "11px 13px", border: "1px solid #e2eae6", borderRadius: 12, background: "#f8fbf9" }}>
                    {item.name && <div style={{ color: "#173c32", fontSize: 15, fontWeight: 800, lineHeight: 1.35 }}>{item.name}</div>}
                    {item.description && <div style={{ marginTop: 4, color: "#64736c", fontSize: 13, lineHeight: 1.45 }}>{item.description}</div>}
                  </div>
                ))}
              </div>
            </div>

            <div style={{
              marginTop: 10,
              fontSize: 13,
              opacity: 0.7
            }}>
              {selectedOrder.status}
            </div>

            <div style={{
              marginTop: 10,
              fontWeight: "bold",
              fontSize: 18
            }}>
              {selectedOrder.totalPrice} €
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
