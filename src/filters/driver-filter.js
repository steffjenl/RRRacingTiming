function matchesContains(source, needle) {
  if (!needle) {
    return true;
  }
  return String(source ?? "").toLowerCase().includes(String(needle).toLowerCase());
}

export function filterDrivers(drivers, options) {
  return (drivers || []).filter((driver) => {
    if (!matchesContains(driver.name, options.driver)) {
      return false;
    }
    if (!matchesContains(driver.number, options.driverNumber)) {
      return false;
    }
    if (!matchesContains(driver.team, options.team)) {
      return false;
    }
    return true;
  });
}
