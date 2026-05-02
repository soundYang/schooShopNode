function maskPhone(phone) {
  if (!phone) return phone
  const str = String(phone)
  if (str.length < 7) return str
  return str.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
}

function maskAddressesPhone(addresses) {
  if (!addresses) return addresses
  if (Array.isArray(addresses)) {
    return addresses.map(addr => {
      if (addr.phone) addr.phone = maskPhone(addr.phone)
      return addr
    })
  }
  if (addresses.phone) {
    addresses.phone = maskPhone(addresses.phone)
  }
  return addresses
}

module.exports = { maskPhone, maskAddressesPhone }
