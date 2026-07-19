// Payment Distribution Utility with Auto-Allocation

const PRIORITY_ORDER = [
  'previous_due',  // Previous due gets highest priority
  'rent',          // Then rent
  'electricity',
  'gas',
  'water',
  'internet',      // WiFi
  'dust',
  'khala',
  'extra_rent',
  'eid_bonus'      // Bonus
];

/**
 * Convert any value to a safe number
 */
const toNumber = (value) => {
  const num = Number(value);
  return isNaN(num) ? 0 : num;
};

/**
 * Calculate ceiling division
 */
const ceilDiv = (total, members) => {
  return Math.ceil(toNumber(total) / Math.max(toNumber(members), 1));
};

/**
 * Distribute a single payment amount across all bills based on priority
 * This function takes the TOTAL payment made by user and distributes it
 */
export function distributePayment(totalPaidAmount, bills) {
  let remaining = toNumber(totalPaidAmount);
  const distributedBills = [];
  
  // Sort bills by priority (lower index = higher priority)
  const sortedBills = [...bills].sort((a, b) => {
    const priorityA = PRIORITY_ORDER.indexOf(a.type);
    const priorityB = PRIORITY_ORDER.indexOf(b.type);
    
    // If type not found in priority list, put at end
    if (priorityA === -1 && priorityB === -1) return 0;
    if (priorityA === -1) return 1;
    if (priorityB === -1) return -1;
    
    return priorityA - priorityB;
  });

  // Calculate total share for reference
  const totalShare = sortedBills.reduce((sum, bill) => sum + bill.myShare, 0);
  
  // Distribute payment to each bill in priority order
  for (const bill of sortedBills) {
    const needToPay = Math.max(bill.myShare - bill.paid, 0);
    
    if (remaining <= 0 || needToPay <= 0) {
      // No more payment to distribute or bill is already fully paid
      // Keep original paid amount from Firebase
      distributedBills.push({
        ...bill,
        paid: bill.paid,
        due: Math.max(bill.myShare - bill.paid, 0),
        status: getStatus(bill.myShare, bill.paid)
      });
      continue;
    }

    // Allocate only what's needed for this bill
    const allocatedAmount = Math.min(remaining, needToPay);
    const newPaidAmount = bill.paid + allocatedAmount;
    const newDue = Math.max(bill.myShare - newPaidAmount, 0);
    const newStatus = getStatus(bill.myShare, newPaidAmount);

    distributedBills.push({
      ...bill,
      paid: newPaidAmount,
      due: newDue,
      status: newStatus,
      allocated: allocatedAmount
    });

    remaining -= allocatedAmount;
  }

  // Calculate totals from distributed bills
  const totalPaid = distributedBills.reduce((sum, bill) => sum + bill.paid, 0);
  const totalDue = distributedBills.reduce((sum, bill) => sum + bill.due, 0);
  const advanceAmount = remaining > 0 ? remaining : 0;

  return {
    bills: distributedBills,
    totalPaid,
    totalDue,
    totalShare,
    advanceAmount,
    remainingToPay: Math.max(totalShare - totalPaid, 0),
    isFullyPaid: totalPaid >= totalShare,
    hasAdvance: advanceAmount > 0
  };
}

/**
 * Get status based on share and paid amount
 */
function getStatus(myShare, paid) {
  if (myShare === 0) return 'n/a';
  if (paid >= myShare) return 'paid';
  if (paid > 0) return 'partial';
  return 'pending';
}

/**
 * Calculate individual bill values from Firebase data
 */
export function calculateBillValues(bill, userId, userRoom) {
  const totalCost = toNumber(bill.totalUtilityCost || bill.totalRoomRent || bill.amount);
  
  let members;
  if (bill.category === 'rent') {
    members = Math.max(toNumber(bill.membersInRoom), 1);
  } else {
    members = Math.max(toNumber(bill.totalMembers), 1);
  }
  
  const myShare = ceilDiv(totalCost, members);
  const paid = toNumber(bill.paidAmount);
  const due = Math.max(myShare - paid, 0);
  const status = getStatus(myShare, paid);

  return {
    ...bill,
    totalCost,
    members,
    myShare,
    paid,
    due,
    status
  };
}

// Export helpers
export { toNumber, ceilDiv, getStatus, PRIORITY_ORDER };