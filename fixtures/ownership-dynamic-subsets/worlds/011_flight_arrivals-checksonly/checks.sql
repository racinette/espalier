SELECT flight_id FROM arrivals GROUP BY flight_id HAVING COUNT(*) > 1;
