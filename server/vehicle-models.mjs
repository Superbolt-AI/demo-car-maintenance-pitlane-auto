// Editable DEMO lookup rules, not a complete vehicle database.
// The category selects the service price from the Service pricing page.
export const vehicleModels = [
  { make: 'Toyota', model: 'Corolla', vehicleType: 'car', aliases: ['Toyota Corolla'] },
  { make: 'Toyota', model: 'Camry', vehicleType: 'car', aliases: ['Toyota Camry'] },
  { make: 'Toyota', model: 'RAV4', vehicleType: 'suv', aliases: ['Toyota RAV4'] },
  { make: 'Mazda', model: 'Mazda3', vehicleType: 'car', aliases: ['Mazda 3'] },
  { make: 'Mazda', model: 'CX-5', vehicleType: 'suv', aliases: ['Mazda CX-5', 'CX5'] },
  { make: 'Ford', model: 'Ranger', vehicleType: 'ute', aliases: ['Ford Ranger'] },
  { make: 'BMW', model: '320i', vehicleType: 'luxury', aliases: ['BMW 320i'] },
];

const normalize = value => value.trim().toLowerCase().replace(/[\s-]+/g, '');

export function findVehicle(model, make) {
  const matches = vehicleModels.filter(vehicle =>
    [vehicle.model, ...vehicle.aliases].some(alias => normalize(alias) === normalize(model)) &&
    (!make || normalize(make) === normalize(vehicle.make))
  );
  return matches.length === 1 ? matches[0] : null;
}
