const colors = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-green-50 text-green-600",
  purple: "bg-purple-50 text-purple-600",
  orange: "bg-orange-50 text-orange-600",
};

interface CardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: keyof typeof colors;
}

const Card = ({ title, value, icon, color }: CardProps) => {
  return (
    <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 flex items-center space-x-4">
      <div className={`p-3 rounded-lg ${colors[color]}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-gray-500 font-medium">{title}</p>
        <h3 className="text-2xl font-bold text-gray-800">{value}</h3>
      </div>
    </div>
  );
};

export default Card;